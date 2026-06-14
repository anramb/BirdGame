"""
Bird Audio Feature Extraction Preprocessor
==========================================
Analyzes all bird audio recordings and extracts acoustic features
for use in the browser-based Bird Sound Identification system.

Output: bird_audio_features.json (loaded by audio-analyzer.js)

Requirements: pip install librosa numpy scipy soundfile
"""

import os
import json
import re
import numpy as np
import librosa
import warnings
import sys
from pathlib import Path

warnings.filterwarnings('ignore')

# Configuration
AUDIO_DIR = os.path.join(os.path.dirname(__file__), "All birds")
ALLBIRDS_JS = os.path.join(os.path.dirname(__file__), "allbirds.js")
OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "bird_audio_features.json")

# Feature extraction parameters
SR = 22050          # Sample rate for analysis
N_FFT = 2048       # FFT window size
HOP_LENGTH = 512   # Hop length for STFT
N_MFCC = 13        # Number of MFCC coefficients
FREQ_MIN = 200     # Min frequency of interest (Hz)
FREQ_MAX = 12000   # Max frequency of interest (Hz)


def parse_allbirds_js(filepath):
    """Parse allbirds.js to get the list of audio files and metadata."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    birds = []
    # Match each bird object
    pattern = r'\{([^}]+)\}'
    for match in re.finditer(pattern, content):
        obj_str = match.group(1)
        bird = {}
        # Extract key-value pairs
        for kv in re.finditer(r'(\w+)\s*:\s*("(?:[^"\\]|\\.)*"|[^,}]+)', obj_str):
            key = kv.group(1)
            val = kv.group(2).strip()
            if val.startswith('"') and val.endswith('"'):
                val = val[1:-1]
            elif val == 'true':
                val = True
            elif val == 'false':
                val = False
            else:
                try:
                    val = int(val)
                except ValueError:
                    try:
                        val = float(val)
                    except ValueError:
                        pass
            bird[key] = val
        if 'audio' in bird and 'english' in bird:
            birds.append(bird)

    return birds


def extract_features(audio_path):
    """Extract acoustic features from an audio file."""
    try:
        y, sr = librosa.load(audio_path, sr=SR, mono=True)
    except Exception as e:
        print(f"  ERROR loading: {e}")
        return None

    if len(y) == 0:
        print(f"  ERROR: empty audio")
        return None

    duration = len(y) / sr

    # --- Spectral features ---
    # Compute STFT
    S = np.abs(librosa.stft(y, n_fft=N_FFT, hop_length=HOP_LENGTH))
    S_db = librosa.amplitude_to_db(S, ref=np.max)

    # Frequency axis
    freqs = librosa.fft_frequencies(sr=sr, n_fft=N_FFT)

    # Focus on bird-relevant frequency range
    freq_mask = (freqs >= FREQ_MIN) & (freqs <= FREQ_MAX)
    S_bird = S[freq_mask, :]
    freqs_bird = freqs[freq_mask]

    if S_bird.size == 0:
        print(f"  WARNING: no energy in bird frequency range")
        return None

    # Mean spectrum (average across time)
    mean_spectrum = np.mean(S_bird, axis=1)

    # Dominant frequency (frequency with most energy)
    dominant_idx = np.argmax(mean_spectrum)
    dominant_freq = float(freqs_bird[dominant_idx])

    # Frequency range (where energy is above threshold)
    threshold = np.max(mean_spectrum) * 0.1
    active_freqs = freqs_bird[mean_spectrum > threshold]
    if len(active_freqs) > 0:
        freq_low = float(np.min(active_freqs))
        freq_high = float(np.max(active_freqs))
    else:
        freq_low = dominant_freq
        freq_high = dominant_freq

    # Spectral centroid (brightness)
    spectral_centroid = float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr, n_fft=N_FFT, hop_length=HOP_LENGTH)))

    # Spectral bandwidth
    spectral_bandwidth = float(np.mean(librosa.feature.spectral_bandwidth(y=y, sr=sr, n_fft=N_FFT, hop_length=HOP_LENGTH)))

    # Spectral rolloff
    spectral_rolloff = float(np.mean(librosa.feature.spectral_rolloff(y=y, sr=sr, n_fft=N_FFT, hop_length=HOP_LENGTH)))

    # --- Temporal features ---
    # RMS energy
    rms = librosa.feature.rms(y=y, hop_length=HOP_LENGTH)[0]
    mean_rms = float(np.mean(rms))

    # Zero crossing rate
    zcr = float(np.mean(librosa.feature.zero_crossing_rate(y=y, hop_length=HOP_LENGTH)))

    # --- Rhythm / Repetition ---
    # Onset detection for rhythm analysis
    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP_LENGTH)
    onsets = librosa.onset.onset_detect(y=y, sr=sr, hop_length=HOP_LENGTH, units='time')

    num_onsets = len(onsets)
    if num_onsets >= 2:
        onset_intervals = np.diff(onsets)
        mean_onset_interval = float(np.mean(onset_intervals))
        onset_regularity = float(1.0 / (1.0 + np.std(onset_intervals)))  # Higher = more regular
        repetition_rate = float(num_onsets / duration)  # Onsets per second
    else:
        mean_onset_interval = 0.0
        onset_regularity = 0.0
        repetition_rate = 0.0

    # Tempo estimation
    tempo = float(librosa.beat.tempo(onset_envelope=onset_env, sr=sr, hop_length=HOP_LENGTH)[0])

    # --- MFCC features ---
    mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=N_MFCC, n_fft=N_FFT, hop_length=HOP_LENGTH)
    mfcc_mean = [float(x) for x in np.mean(mfccs, axis=1)]
    mfcc_std = [float(x) for x in np.std(mfccs, axis=1)]

    # --- Spectral shape features (compact representation) ---
    # Divide bird frequency range into bands and compute energy distribution
    n_bands = 8
    band_edges = np.linspace(FREQ_MIN, FREQ_MAX, n_bands + 1)
    band_energies = []
    for i in range(n_bands):
        band_mask = (freqs_bird >= band_edges[i]) & (freqs_bird < band_edges[i + 1])
        if np.any(band_mask):
            band_energies.append(float(np.mean(mean_spectrum[band_mask])))
        else:
            band_energies.append(0.0)

    # Normalize band energies
    total_energy = sum(band_energies)
    if total_energy > 0:
        band_energies = [e / total_energy for e in band_energies]

    # --- Audio fingerprint (compact spectral hash) ---
    # Create a simplified spectral envelope (32 points)
    if len(mean_spectrum) >= 32:
        indices = np.linspace(0, len(mean_spectrum) - 1, 32, dtype=int)
        spectral_envelope = [float(mean_spectrum[i]) for i in indices]
    else:
        spectral_envelope = [float(x) for x in mean_spectrum]
        while len(spectral_envelope) < 32:
            spectral_envelope.append(0.0)

    # Normalize spectral envelope
    env_max = max(spectral_envelope) if max(spectral_envelope) > 0 else 1.0
    spectral_envelope = [x / env_max for x in spectral_envelope]

    # --- Temporal envelope (energy over time, 16 segments) ---
    n_segments = 16
    segment_len = len(rms) // n_segments
    temporal_envelope = []
    for i in range(n_segments):
        start = i * segment_len
        end = start + segment_len if i < n_segments - 1 else len(rms)
        temporal_envelope.append(float(np.mean(rms[start:end])))

    # Normalize
    temp_max = max(temporal_envelope) if max(temporal_envelope) > 0 else 1.0
    temporal_envelope = [x / temp_max for x in temporal_envelope]

    features = {
        'duration': round(duration, 3),
        'dominantFreq': round(dominant_freq, 1),
        'freqLow': round(freq_low, 1),
        'freqHigh': round(freq_high, 1),
        'spectralCentroid': round(spectral_centroid, 1),
        'spectralBandwidth': round(spectral_bandwidth, 1),
        'spectralRolloff': round(spectral_rolloff, 1),
        'meanRMS': round(mean_rms, 6),
        'zcr': round(zcr, 6),
        'tempo': round(tempo, 1),
        'numOnsets': num_onsets,
        'meanOnsetInterval': round(mean_onset_interval, 4),
        'onsetRegularity': round(onset_regularity, 4),
        'repetitionRate': round(repetition_rate, 3),
        'mfccMean': [round(x, 4) for x in mfcc_mean],
        'mfccStd': [round(x, 4) for x in mfcc_std],
        'bandEnergies': [round(x, 4) for x in band_energies],
        'spectralEnvelope': [round(x, 4) for x in spectral_envelope],
        'temporalEnvelope': [round(x, 4) for x in temporal_envelope]
    }

    return features


def main():
    print("=" * 60)
    print("Bird Audio Feature Extraction Preprocessor")
    print("=" * 60)

    # Parse allbirds.js
    print(f"\nParsing {ALLBIRDS_JS}...")
    birds = parse_allbirds_js(ALLBIRDS_JS)
    print(f"Found {len(birds)} bird entries")

    # Extract features for each bird
    results = []
    errors = []
    skipped = 0

    for i, bird in enumerate(birds):
        audio_rel = bird.get('audio', '')
        audio_path = os.path.join(os.path.dirname(__file__), audio_rel)

        print(f"\n[{i + 1}/{len(birds)}] {bird.get('english', 'Unknown')} - {os.path.basename(audio_rel)}")

        if not os.path.exists(audio_path):
            print(f"  SKIPPED: file not found at {audio_path}")
            errors.append({'english': bird.get('english'), 'audio': audio_rel, 'error': 'File not found'})
            skipped += 1
            continue

        features = extract_features(audio_path)

        if features is None:
            errors.append({'english': bird.get('english'), 'audio': audio_rel, 'error': 'Feature extraction failed'})
            skipped += 1
            continue

        entry = {
            'index': i,
            'english': bird.get('english', ''),
            'afrikaans': bird.get('afrikaans', ''),
            'audio': audio_rel,
            'hotspot': bird.get('hotspot', ''),
            'habitat': bird.get('habitat', ''),
            'birdgroup': bird.get('birdgroup', ''),
            'image': bird.get('image', ''),
            'spectrogram': bird.get('spectrogram', ''),
            'features': features
        }
        results.append(entry)

        # Print key features
        print(f"  Duration: {features['duration']}s | Dominant: {features['dominantFreq']}Hz | "
              f"Range: {features['freqLow']}-{features['freqHigh']}Hz | "
              f"Onsets: {features['numOnsets']} | Tempo: {features['tempo']}")

    # Save results
    output = {
        'version': '1.0',
        'sampleRate': SR,
        'nFFT': N_FFT,
        'hopLength': HOP_LENGTH,
        'nMFCC': N_MFCC,
        'freqMin': FREQ_MIN,
        'freqMax': FREQ_MAX,
        'totalProcessed': len(results),
        'totalSkipped': skipped,
        'birds': results
    }

    print(f"\n\nSaving features to {OUTPUT_FILE}...")
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False)

    # Also save a compact version (smaller file for mobile)
    compact_file = OUTPUT_FILE.replace('.json', '_compact.json')
    print(f"Saving compact version to {compact_file}...")
    with open(compact_file, 'w') as f:
        json.dump(output, f, separators=(',', ':'))

    file_size = os.path.getsize(OUTPUT_FILE) / 1024
    compact_size = os.path.getsize(compact_file) / 1024

    print(f"\n{'=' * 60}")
    print(f"DONE!")
    print(f"  Processed: {len(results)} recordings")
    print(f"  Skipped:   {skipped} recordings")
    print(f"  Output:    {OUTPUT_FILE} ({file_size:.1f} KB)")
    print(f"  Compact:   {compact_file} ({compact_size:.1f} KB)")

    if errors:
        print(f"\n  Errors:")
        for e in errors:
            print(f"    - {e['english']}: {e['error']}")

    print(f"{'=' * 60}")


if __name__ == '__main__':
    main()
