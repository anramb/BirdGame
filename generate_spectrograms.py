"""
Generate spectrogram PNG images for all bird audio files.
This creates a .png for each .mp3 in the "All birds/" directory.

Usage:
    python generate_spectrograms.py

Requirements:
    pip install librosa matplotlib numpy soundfile

The spectrograms show frequency (0-12000 Hz) vs time, with a dark background
and green/yellow colormap matching the app's style.

After generating, you can annotate specific regions using the annotation tool
or manually specify coordinates in bird_annotations.json.
"""

import os
import sys
import numpy as np
import json

try:
    import librosa
    import librosa.display
    import matplotlib
    matplotlib.use('Agg')  # Non-interactive backend
    import matplotlib.pyplot as plt
    from matplotlib.colors import LinearSegmentedColormap
except ImportError:
    print("Missing dependencies. Install with:")
    print("  pip install librosa matplotlib numpy soundfile")
    sys.exit(1)

# Settings
AUDIO_DIR = "All birds"
OUTPUT_DIR = "All birds"  # Same directory, .png next to .mp3
SR = 22050           # Sample rate for analysis
N_FFT = 2048
HOP_LENGTH = 512
FMAX = 12000         # Maximum frequency to display
FIG_WIDTH = 10       # Figure width in inches
FIG_HEIGHT = 3       # Figure height in inches
DPI = 100            # Resolution

# Custom colormap (dark background, green-yellow for energy)
colors = ['#1a1a2e', '#0d3320', '#1a6b3a', '#4caf50', '#8bc34a', '#ffeb3b', '#ffffff']
cmap = LinearSegmentedColormap.from_list('bird_spectro', colors, N=256)


def generate_spectrogram(audio_path, output_path):
    """Generate a spectrogram PNG from an audio file."""
    try:
        # Load audio
        y, sr = librosa.load(audio_path, sr=SR, mono=True)
        
        if len(y) < N_FFT:
            print(f"  SKIP (too short): {audio_path}")
            return False
        
        # Compute spectrogram
        S = librosa.feature.melspectrogram(
            y=y, sr=sr, n_fft=N_FFT, hop_length=HOP_LENGTH,
            n_mels=128, fmax=FMAX
        )
        S_dB = librosa.power_to_db(S, ref=np.max)
        
        # Create figure
        fig, ax = plt.subplots(1, 1, figsize=(FIG_WIDTH, FIG_HEIGHT))
        fig.patch.set_facecolor('#1a1a2e')
        ax.set_facecolor('#1a1a2e')
        
        # Plot spectrogram
        librosa.display.specshow(
            S_dB, sr=sr, hop_length=HOP_LENGTH,
            x_axis='time', y_axis='mel', fmax=FMAX,
            cmap=cmap, ax=ax, vmin=-80, vmax=0
        )
        
        # Style
        ax.set_xlabel('')
        ax.set_ylabel('')
        ax.tick_params(colors='#888888', labelsize=7)
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        ax.spines['bottom'].set_color('#444')
        ax.spines['left'].set_color('#444')
        
        # Add time markers every 2 seconds
        duration = len(y) / sr
        time_ticks = np.arange(0, duration, 2.0)
        ax.set_xticks(time_ticks)
        ax.set_xticklabels([f'{t:.0f}s' for t in time_ticks], fontsize=7, color='#888')
        
        # Add frequency markers
        freq_ticks = [500, 1000, 2000, 4000, 6000, 8000, 10000]
        freq_ticks = [f for f in freq_ticks if f <= FMAX]
        ax.set_yticks(freq_ticks)
        ax.set_yticklabels([f'{f/1000:.0f}k' if f >= 1000 else str(f) for f in freq_ticks], 
                          fontsize=7, color='#888')
        
        plt.tight_layout(pad=0.3)
        plt.savefig(output_path, dpi=DPI, facecolor='#1a1a2e', 
                   bbox_inches='tight', pad_inches=0.1)
        plt.close(fig)
        
        return True
    except Exception as e:
        print(f"  ERROR: {audio_path} -> {e}")
        return False


def main():
    if not os.path.isdir(AUDIO_DIR):
        print(f"Error: '{AUDIO_DIR}' directory not found.")
        print("Run this script from the BestRunDay project root.")
        sys.exit(1)
    
    # Find all audio files
    audio_extensions = ('.mp3', '.wav', '.ogg', '.flac', '.m4a')
    audio_files = [f for f in os.listdir(AUDIO_DIR) if f.lower().endswith(audio_extensions)]
    audio_files.sort()
    
    print(f"Found {len(audio_files)} audio files in '{AUDIO_DIR}/'")
    print(f"Generating spectrograms...\n")
    
    generated = 0
    skipped = 0
    errors = 0
    
    for i, filename in enumerate(audio_files):
        audio_path = os.path.join(AUDIO_DIR, filename)
        png_name = os.path.splitext(filename)[0] + '.png'
        output_path = os.path.join(OUTPUT_DIR, png_name)
        
        # Skip if already exists (unless --force flag)
        if os.path.exists(output_path) and '--force' not in sys.argv:
            skipped += 1
            continue
        
        print(f"  [{i+1}/{len(audio_files)}] {filename}")
        
        if generate_spectrogram(audio_path, output_path):
            generated += 1
        else:
            errors += 1
    
    print(f"\nDone!")
    print(f"  Generated: {generated}")
    print(f"  Skipped (already exist): {skipped}")
    print(f"  Errors: {errors}")
    print(f"\nTo regenerate all: python generate_spectrograms.py --force")
    
    # Create empty annotations file if it doesn't exist
    annotations_file = 'bird_annotations.json'
    if not os.path.exists(annotations_file):
        template = {
            "_description": "Bird call annotations. Each entry marks where the bird's call appears on the spectrogram.",
            "_format": "Each annotation has: x1,y1,x2,y2 in pixels (top-left to bottom-right of rectangle), or time_start, time_end, freq_low, freq_high in seconds/Hz.",
            "_how_to_annotate": "Open the PNG in any image viewer, note the pixel coordinates of rectangles around bird calls. Or use the web annotation tool at annotate.html.",
            "annotations": {}
        }
        with open(annotations_file, 'w', encoding='utf-8') as f:
            json.dump(template, f, indent=2, ensure_ascii=False)
        print(f"\nCreated {annotations_file} — add annotations for each bird's call regions.")


if __name__ == '__main__':
    main()
