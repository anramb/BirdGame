"""
Recompute bird audio features using the EXACT SAME algorithm as audio-analyzer.js.
This eliminates Python(librosa) vs JavaScript(Web Audio API) mismatches.

Key differences from the original Python script:
- Uses raw FFT (not mel spectrogram) for feature extraction
- Same windowing (Hann), FFT size (2048), hop (512)
- Same frequency range (200-12000 Hz)
- Same band energy computation
- Same spectral envelope (32 points)
- Same temporal envelope (16 segments)
- Same onset detection
- Same MFCC (simplified mel filter bank)

Output: bird_audio_features.json in the new JS-compatible format.
"""

import os
import sys
import json
import numpy as np
import warnings
warnings.filterwarnings('ignore')

try:
    import librosa
except ImportError:
    print("pip install librosa soundfile")
    sys.exit(1)

# Settings — must match audio-analyzer.js EXACTLY
SR = 22050
N_FFT = 2048
HOP_LENGTH = 512
FREQ_MIN = 200
FREQ_MAX = 12000
N_MFCC = 13
AUDIO_DIR = "All birds"


def hann_window(n):
    """Same Hann window as JS: 0.5 - 0.5*cos(2*pi*i/n)"""
    return 0.5 - 0.5 * np.cos(2 * np.pi * np.arange(n) / n)


def compute_fft_magnitude(frame):
    """Same as JS _fft: apply Hann window, FFT, magnitude/n"""
    n = len(frame)
    windowed = frame * hann_window(n)
    fft_result = np.fft.rfft(windowed)
    magnitude = np.abs(fft_result) / n
    return magnitude


def resample_array(arr, target_len):
    """Same as JS _resampleArray"""
    if len(arr) == 0:
        return [0.0] * target_len
    if len(arr) == target_len:
        return list(arr)
    result = []
    for i in range(target_len):
        pos = i * (len(arr) - 1) / max(target_len - 1, 1)
        low = int(pos)
        high = min(low + 1, len(arr) - 1)
        frac = pos - low
        result.append(arr[low] * (1 - frac) + arr[high] * frac)
    return result


def compute_mel_filterbank(sr, n_fft, n_mels=40, fmin=0, fmax=None):
    """Simplified mel filterbank — same as JS _computeMFCC"""
    if fmax is None:
        fmax = sr / 2
    
    def hz_to_mel(f):
        return 2595 * np.log10(1 + f / 700)
    
    def mel_to_hz(m):
        return 700 * (10 ** (m / 2595) - 1)
    
    num_bins = n_fft // 2 + 1
    mel_low = hz_to_mel(fmin)
    mel_high = hz_to_mel(fmax)
    mel_points = np.linspace(mel_low, mel_high, n_mels + 2)
    hz_points = [mel_to_hz(m) for m in mel_points]
    bin_points = [int(h * n_fft / sr) for h in hz_points]
    
    filterbank = np.zeros((n_mels, num_bins))
    for i in range(n_mels):
        left = bin_points[i]
        center = bin_points[i + 1]
        right = bin_points[i + 2]
        for j in range(left, center):
            if center > left:
                filterbank[i][j] = (j - left) / (center - left)
        for j in range(center, right):
            if right > center:
                filterbank[i][j] = (right - j) / (right - center)
    
    return filterbank


def compute_mfcc(spectrogram_frames, sr, n_mfcc=13):
    """Same MFCC as JS _computeMFCC — uses 26 mel filters from FREQ_MIN to FREQ_MAX"""
    n_mels = 26  # MUST match JS: const nMelFilters = 26
    num_bins = len(spectrogram_frames[0]) if spectrogram_frames else 0
    filterbank = compute_mel_filterbank(sr, N_FFT, n_mels, FREQ_MIN, min(FREQ_MAX, sr / 2))
    
    n_frames = len(spectrogram_frames)
    mfcc_frames = []
    
    for frame_mag in spectrogram_frames:
        # Apply mel filterbank
        mel_energies = np.dot(filterbank, frame_mag[:filterbank.shape[1]] ** 2)
        # Log
        log_mel = np.log(np.maximum(mel_energies, 1e-10))
        # DCT (simplified — same as JS)
        mfcc = np.zeros(n_mfcc)
        for i in range(n_mfcc):
            s = 0
            for j in range(n_mels):
                s += log_mel[j] * np.cos(np.pi * i * (j + 0.5) / n_mels)
            mfcc[i] = s
        mfcc_frames.append(mfcc)
    
    if not mfcc_frames:
        return {'mean': [0.0] * n_mfcc, 'std': [0.0] * n_mfcc, 'allFrames': []}
    
    mfcc_arr = np.array(mfcc_frames)
    return {
        'mean': [round(float(x), 6) for x in np.mean(mfcc_arr, axis=0)],
        'std': [round(float(x), 6) for x in np.std(mfcc_arr, axis=0)],
        'allFrames': mfcc_frames  # list of numpy arrays
    }


def estimate_noise_floor(spectrogram, num_bins):
    """Same as JS _estimateNoiseFloor: average of quietest 20% of frames."""
    num_frames = len(spectrogram)
    if num_frames == 0:
        return np.zeros(num_bins)
    
    # Compute energy per frame
    frame_energies = []
    for f in range(num_frames):
        energy = np.sum(np.array(spectrogram[f]) ** 2)
        frame_energies.append((f, energy))
    
    # Sort by energy, take quietest 20%
    frame_energies.sort(key=lambda x: x[1])
    noise_count = max(3, int(num_frames * 0.2))
    
    noise_floor = np.zeros(num_bins)
    for i in range(noise_count):
        noise_floor += np.array(spectrogram[frame_energies[i][0]])
    noise_floor /= noise_count
    
    return noise_floor


def subtract_noise(spectrogram, noise_floor, num_bins, gain=1.5):
    """Same as JS _subtractNoise: spectral gating."""
    result = []
    for frame in spectrogram:
        denoised = np.maximum(0, np.array(frame) - noise_floor * gain)
        result.append(denoised)
    return result


def segment_vocalizations(spectrogram, noise_floor, sr, num_bins):
    """Same as JS _segmentVocalizations: find active bird frames."""
    fft_size = N_FFT
    num_frames = len(spectrogram)
    
    bird_bin_low = int(500 * fft_size / sr)
    bird_bin_high = min(int(10000 * fft_size / sr), num_bins - 1)
    
    # Noise base energy in bird band
    noise_base = np.sum(noise_floor[bird_bin_low:bird_bin_high+1] ** 2)
    noise_base = max(noise_base, 1e-10)
    
    # Bird band energy per frame
    bird_energies = []
    for f in range(num_frames):
        bird_e = np.sum(np.array(spectrogram[f][bird_bin_low:bird_bin_high+1]) ** 2)
        bird_energies.append(bird_e)
    
    # Thresholds (same as JS)
    threshold = noise_base * 4.0
    mean_bird_e = np.mean(bird_energies) if bird_energies else 0
    std_bird_e = np.std(bird_energies) if bird_energies else 0
    adaptive_threshold = mean_bird_e + std_bird_e * 0.5
    
    # Active frames
    active = [bird_energies[f] > threshold and bird_energies[f] > adaptive_threshold for f in range(num_frames)]
    
    # Dilate: fill gaps up to 3 frames
    dilated = list(active)
    for f in range(1, num_frames - 1):
        if not dilated[f] and dilated[f-1] and f+1 < num_frames and dilated[f+1]:
            dilated[f] = True
    for f in range(num_frames - 3):
        if dilated[f] and not dilated[f+1] and not dilated[f+2] and dilated[f+3]:
            dilated[f+1] = True
            dilated[f+2] = True
    
    # Group into segments
    segments = []
    seg_start = -1
    for f in range(num_frames + 1):
        is_active = dilated[f] if f < num_frames else False
        if is_active and seg_start < 0:
            seg_start = f
        elif not is_active and seg_start >= 0:
            if f - seg_start >= 4:  # Minimum 4 frames
                segments.append((seg_start, f))
            seg_start = -1
    
    # Fallback: use entire recording if too little active
    total_active = sum(e - s for s, e in segments)
    if len(segments) == 0 or total_active < 8:
        return [(0, num_frames)]
    
    return segments


def extract_pitch_contour(active_spectrogram, sr, num_bins):
    """Same as JS _extractPitchContour: peak frequency per frame, median smoothed, semitone normalized."""
    fft_size = N_FFT
    num_frames = len(active_spectrogram)
    if num_frames == 0:
        return None
    
    # Bird frequency bins for pitch (300-8000 Hz)
    pitch_min_bin = int(300 * fft_size / sr)
    pitch_max_bin = min(int(8000 * fft_size / sr), num_bins - 1)
    
    # Peak frequency per frame with parabolic interpolation
    raw_pitch = []
    for f in range(num_frames):
        frame = active_spectrogram[f]
        max_val = 0
        max_bin = pitch_min_bin
        
        for i in range(pitch_min_bin, min(pitch_max_bin + 1, len(frame))):
            if frame[i] > max_val:
                max_val = frame[i]
                max_bin = i
        
        # Parabolic interpolation
        peak_freq = max_bin * sr / fft_size
        if max_bin > 0 and max_bin < len(frame) - 1:
            alpha = float(frame[max_bin - 1])
            beta = float(frame[max_bin])
            gamma = float(frame[max_bin + 1])
            denom = alpha - 2 * beta + gamma
            if abs(denom) > 1e-10:
                p = 0.5 * (alpha - gamma) / denom
                peak_freq = (max_bin + p) * sr / fft_size
        
        raw_pitch.append(peak_freq)
    
    # Median filter (window size 3)
    smoothed = []
    for i in range(len(raw_pitch)):
        vals = sorted(raw_pitch[max(0, i-1):min(len(raw_pitch), i+2)])
        smoothed.append(vals[len(vals) // 2])
    
    # Downsample to ~50 points
    target_len = 50
    contour = resample_array(smoothed, min(target_len, len(smoothed)))
    
    # Normalize to semitones relative to minimum frequency
    min_freq = max(200.0, min(contour))
    normalized = []
    for f in contour:
        if f <= 0 or min_freq <= 0:
            normalized.append(0.0)
        else:
            normalized.append(12 * np.log2(f / min_freq))
    
    return [round(x, 2) for x in normalized]


def extract_features(y, sr):
    """Extract features using the EXACT same algorithm as audio-analyzer.js extractFeatures()"""
    
    duration = len(y) / sr
    fft_size = N_FFT
    hop_length = HOP_LENGTH
    num_bins = fft_size // 2 + 1
    freqs = np.array([i * sr / fft_size for i in range(num_bins)])
    
    # Compute raw spectrogram frames
    num_frames = (len(y) - fft_size) // hop_length
    if num_frames <= 0:
        return None
    
    raw_spectrogram = []
    rms_values = []
    zcr_values = []
    
    for f in range(num_frames):
        start = f * hop_length
        frame = y[start:start + fft_size]
        if len(frame) < fft_size:
            frame = np.pad(frame, (0, fft_size - len(frame)))
        
        spectrum = compute_fft_magnitude(frame)
        raw_spectrogram.append(spectrum)
        
        # RMS
        rms = np.sqrt(np.mean(frame ** 2))
        rms_values.append(rms)
        
        # ZCR
        signs = np.sign(frame)
        zcr_count = np.sum(np.abs(np.diff(signs)) > 0)
        zcr_values.append(zcr_count / (2 * fft_size))
    
    # --- NOISE SUBTRACTION ---
    noise_floor = estimate_noise_floor(raw_spectrogram, num_bins)
    spectrogram = subtract_noise(raw_spectrogram, noise_floor, num_bins, gain=1.5)
    
    # --- VOCALIZATION SEGMENTATION ---
    segments = segment_vocalizations(raw_spectrogram, noise_floor, sr, num_bins)
    
    # Extract active frames from denoised spectrogram
    active_spectrogram = []
    for seg_start, seg_end in segments:
        for f in range(seg_start, min(seg_end, len(spectrogram))):
            active_spectrogram.append(spectrogram[f])
    
    active_num_frames = len(active_spectrogram)
    
    # Mean spectrum from ACTIVE DENOISED frames only
    if active_num_frames > 0:
        mean_spectrum = np.mean(active_spectrogram, axis=0)
    else:
        mean_spectrum = np.mean(spectrogram, axis=0)
    
    # Bird frequency range
    bird_bin_low = int(FREQ_MIN * fft_size / sr)
    bird_bin_high = int(FREQ_MAX * fft_size / sr)
    
    # Dominant frequency
    bird_range = mean_spectrum[bird_bin_low:min(bird_bin_high + 1, num_bins)]
    if len(bird_range) > 0:
        dominant_bin = bird_bin_low + np.argmax(bird_range)
        max_energy = mean_spectrum[dominant_bin]
    else:
        dominant_bin = bird_bin_low
        max_energy = 0
    dominant_freq = dominant_bin * sr / fft_size
    
    # Frequency range (>10% of max)
    threshold = max_energy * 0.1
    freq_low = dominant_freq
    freq_high = dominant_freq
    for i in range(bird_bin_low, min(bird_bin_high + 1, num_bins)):
        if mean_spectrum[i] > threshold:
            f = i * sr / fft_size
            if f < freq_low:
                freq_low = f
            if f > freq_high:
                freq_high = f
    
    # Spectral centroid
    centroid_num = np.sum(freqs * mean_spectrum)
    centroid_den = np.sum(mean_spectrum)
    spectral_centroid = centroid_num / centroid_den if centroid_den > 0 else 0
    
    # Spectral bandwidth
    bw_num = np.sum(mean_spectrum * (freqs - spectral_centroid) ** 2)
    spectral_bandwidth = np.sqrt(bw_num / centroid_den) if centroid_den > 0 else 0
    
    # Spectral rolloff (85%)
    total_energy = centroid_den
    cum_energy = 0
    spectral_rolloff = sr / 2
    for i in range(num_bins):
        cum_energy += mean_spectrum[i]
        if cum_energy >= total_energy * 0.85:
            spectral_rolloff = i * sr / fft_size
            break
    
    # Mean RMS and ZCR
    mean_rms = float(np.mean(rms_values))
    zcr = float(np.mean(zcr_values))
    
    # Onset detection
    onset_threshold = mean_rms * 1.5
    onsets = []
    was_above = False
    for i, rms in enumerate(rms_values):
        if rms > onset_threshold and not was_above:
            onsets.append(i * hop_length / sr)
            was_above = True
        elif rms <= onset_threshold:
            was_above = False
    
    num_onsets = len(onsets)
    
    if num_onsets >= 2:
        intervals = [onsets[i+1] - onsets[i] for i in range(len(onsets)-1)]
        mean_onset_interval = float(np.mean(intervals))
        onset_regularity = 1 - min(float(np.std(intervals)) / max(mean_onset_interval, 0.001), 1) if mean_onset_interval > 0 else 0
    else:
        mean_onset_interval = 0
        onset_regularity = 0
    
    # Tempo
    if mean_onset_interval > 0:
        tempo = 60 / mean_onset_interval
    else:
        tempo = 0
    
    # Repetition rate
    repetition_rate = num_onsets / duration if duration > 0 else 0
    
    # MFCC — compute from active (denoised) spectrogram
    mfccs = compute_mfcc(active_spectrogram, sr, N_MFCC)
    
    # MFCC Sequence (downsampled to ~50 frames for DTW)
    target_mfcc_frames = 50
    mfcc_seq = None
    if mfccs['allFrames'] and len(mfccs['allFrames']) > 0:
        all_frames = mfccs['allFrames']
        step = max(1, len(all_frames) // target_mfcc_frames)
        mfcc_seq = []
        for i in range(0, len(all_frames), step):
            if len(mfcc_seq) >= target_mfcc_frames:
                break
            mfcc_seq.append([round(float(x), 2) for x in all_frames[i]])
    
    # Pitch contour (melodic shape) — same as JS _extractPitchContour
    pitch_contour = extract_pitch_contour(active_spectrogram, sr, num_bins)
    
    # Segmentation summary
    total_active_frames = sum(e - s for s, e in segments)
    active_duration = total_active_frames * hop_length / sr
    note_count = len(segments)
    
    # Band energies (8 bands)
    band_edges = [200, 500, 1000, 2000, 3000, 4000, 6000, 8000, 12000]
    band_energies = []
    for i in range(len(band_edges) - 1):
        b_low = int(band_edges[i] * fft_size / sr)
        b_high = int(band_edges[i + 1] * fft_size / sr)
        energy = 0
        count = 0
        for j in range(b_low, min(b_high, num_bins)):
            energy += mean_spectrum[j]
            count += 1
        band_energies.append(energy / count if count > 0 else 0)
    band_total = sum(band_energies)
    norm_band = [e / band_total if band_total > 0 else 0 for e in band_energies]
    
    # Spectral envelope (32 points)
    bird_spectrum = list(mean_spectrum[bird_bin_low:min(bird_bin_high + 1, num_bins)])
    spectral_envelope = resample_array(bird_spectrum, 32)
    env_max = max(max(spectral_envelope), 0.0001)
    norm_spectral_envelope = [x / env_max for x in spectral_envelope]
    
    # Temporal envelope (16 segments)
    n_segments = 16
    seg_len = len(rms_values) // n_segments
    temporal_envelope = []
    for i in range(n_segments):
        start = i * seg_len
        end = start + seg_len if i < n_segments - 1 else len(rms_values)
        seg = rms_values[start:end]
        temporal_envelope.append(float(np.mean(seg)) if seg else 0)
    temp_max = max(max(temporal_envelope), 0.0001)
    norm_temporal_envelope = [x / temp_max for x in temporal_envelope]
    
    return {
        'duration': round(duration, 3),
        'activeDuration': round(active_duration, 3),
        'noteCount': note_count,
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
        'mfccMean': [round(x, 6) for x in mfccs['mean']],
        'mfccStd': [round(x, 6) for x in mfccs['std']],
        'mfccSeq': mfcc_seq,
        'pitchContour': pitch_contour,
        'bandEnergies': [round(x, 4) for x in norm_band],
        'spectralEnvelope': [round(x, 4) for x in norm_spectral_envelope],
        'temporalEnvelope': [round(x, 4) for x in norm_temporal_envelope]
    }


def main():
    force_all = '--force' in sys.argv

    if not os.path.isdir(AUDIO_DIR):
        print(f"Error: '{AUDIO_DIR}' not found. Run from BestRunDay project root.")
        sys.exit(1)
    
    # Load allbirds.js to get the list
    allbirds_path = 'allbirds.js'
    if not os.path.exists(allbirds_path):
        print("Error: allbirds.js not found")
        sys.exit(1)
    
    # Parse allbirds.js to get audio paths
    with open(allbirds_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    import re
    audio_paths = re.findall(r'audio:\s*"([^"]+)"', content)
    print(f"Found {len(audio_paths)} audio entries in allbirds.js")
    
    # Load existing features (if any) to avoid reprocessing
    output_file = 'bird_audio_features.json'
    existing_features = {}
    if not force_all and os.path.exists(output_file):
        try:
            with open(output_file, 'r', encoding='utf-8') as f:
                existing_data = json.load(f)
            existing_features = existing_data.get('features', {})
            print(f"Loaded {len(existing_features)} existing features from {output_file}")
        except Exception as e:
            print(f"Warning: Could not load existing features ({e}), will reprocess all")
    
    # Find which entries are new/missing
    to_process = []
    for audio_path in audio_paths:
        audio_key = audio_path.replace('All birds/', '').replace('.mp3', '')
        if audio_key not in existing_features:
            to_process.append((audio_key, audio_path))
    
    if len(to_process) == 0 and not force_all:
        print(f"\nAll {len(audio_paths)} entries already have features. Nothing to do.")
        print(f"  (Use --force to reprocess everything)")
        return
    
    if force_all:
        to_process = [(ap.replace('All birds/', '').replace('.mp3', ''), ap) for ap in audio_paths]
        existing_features = {}
        print(f"\n--force: Reprocessing all {len(to_process)} entries...")
    else:
        print(f"\n{len(to_process)} new entries to process (skipping {len(existing_features)} existing):")
        for key, _ in to_process:
            print(f"  + {key}")
    
    features = dict(existing_features)  # start with existing
    errors = 0
    
    from scipy import signal as sig
    
    for i, (audio_key, audio_path) in enumerate(to_process):
        full_path = audio_path  # relative to project root
        
        if not os.path.exists(full_path):
            print(f"  NOT FOUND: {full_path}")
            errors += 1
            continue
        
        try:
            # Load at 22050 Hz (same as JS AudioContext sampleRate)
            y, sr = librosa.load(full_path, sr=SR, mono=True)
            
            if len(y) < N_FFT:
                print(f"  SKIP (too short): {audio_key}")
                errors += 1
                continue
            
            # Apply high-pass filter at 300 Hz (same as browser code)
            b_hp, a_hp = sig.butter(2, 300 / (SR/2), 'high')
            y = sig.filtfilt(b_hp, a_hp, y)
            
            f = extract_features(y, sr)
            if f:
                features[audio_key] = f
                print(f"  [{i+1}/{len(to_process)}] {audio_key} — dom:{f['dominantFreq']}Hz")
                
        except Exception as e:
            print(f"  ERROR: {audio_key} — {e}")
            errors += 1
    
    # Also remove features for entries no longer in allbirds.js
    all_keys = set(ap.replace('All birds/', '').replace('.mp3', '') for ap in audio_paths)
    removed = [k for k in features if k not in all_keys]
    for k in removed:
        del features[k]
        print(f"  Removed stale entry: {k}")
    
    # Save in JS-compatible format
    output = {
        'version': 'js-browser-extracted',
        'extractedAt': None,
        'extractionMethod': 'Python (JS-compatible algorithm)',
        'sampleRate': SR,
        'fftSize': N_FFT,
        'hopLength': HOP_LENGTH,
        'totalProcessed': len(features),
        'features': features
    }
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output, f, separators=(',', ':'))
    
    file_size = os.path.getsize(output_file) / 1024
    print(f"\nDone!")
    print(f"  Total features: {len(features)}")
    print(f"  New processed: {len(to_process) - errors}")
    print(f"  Errors: {errors}")
    if removed:
        print(f"  Removed stale: {len(removed)}")
    print(f"  Output: {output_file} ({file_size:.0f} KB)")


if __name__ == '__main__':
    main()
