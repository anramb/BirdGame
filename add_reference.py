"""
Add a new bird reference recording to the database.

Usage:
    python add_reference.py "Bird Name" "path/to/recording.wav" [--copy-from "Existing Bird Name"]

Examples:
    python add_reference.py "Lapwing Crowned Flight call 2" "C:/Users/anram/Downloads/bird_recording.wav"
    python add_reference.py "Lapwing Crowned Flight call 2" "recording.wav" --copy-from "Lapwing Crowned Flight call"

What it does:
    1. Converts the audio to MP3 and copies it to All birds/
    2. Adds a new entry in allbirds.js (copies metadata from an existing entry if --copy-from is specified)
    3. Recomputes bird_audio_features.json with the new reference included

Requirements:
    pip install librosa soundfile scipy pydub
    ffmpeg must be installed for MP3 conversion
"""

import os
import sys
import re
import json
import shutil
import argparse


def find_existing_entry(allbirds_content, bird_name):
    """Find an existing bird entry in allbirds.js by english name."""
    # Match entries like {english: "Lapwing Crowned Flight call", ...}
    pattern = r'\{english:\s*"([^"]*' + re.escape(bird_name) + r'[^"]*)"[^}]+\}'
    match = re.search(pattern, allbirds_content, re.IGNORECASE)
    if match:
        return match.group(0), match.group(1)
    return None, None


def sanitize_filename(name):
    """Convert bird name to filename format matching existing convention.
    e.g. 'Lapwing Crowned Flight call' -> 'CrownedLapwing'
    e.g. 'Lesser Masked Weaver' -> 'LesserMaskedWeaver'
    Removes Latin names, keeps hyphens, removes spaces."""
    # Remove anything after ' - ' (Latin name from Xeno-Canto)
    if ' - ' in name:
        name = name.split(' - ')[0].strip()
    # Remove special chars except hyphens
    clean = re.sub(r'[^a-zA-Z0-9\s-]', '', name)
    # Remove spaces but keep hyphens (e.g. Black-winged stays)
    parts = clean.split()
    # Capitalize each word and join without spaces
    clean = ''.join(p.capitalize() if not '-' in p else '-'.join(w.capitalize() for w in p.split('-')) for p in parts)
    return clean


def convert_to_mp3(input_path, output_path):
    """Convert audio file to MP3 format."""
    try:
        from pydub import AudioSegment
        audio = AudioSegment.from_file(input_path)
        audio.export(output_path, format="mp3", bitrate="192k")
        return True
    except ImportError:
        print("pydub not installed. Trying ffmpeg directly...")
    
    try:
        import subprocess
        result = subprocess.run(
            ['ffmpeg', '-y', '-i', input_path, '-b:a', '192k', output_path],
            capture_output=True, text=True
        )
        return result.returncode == 0
    except FileNotFoundError:
        print("ERROR: Neither pydub nor ffmpeg found. Install one of them.")
        return False


def main():
    parser = argparse.ArgumentParser(description='Add a new bird reference recording')
    parser.add_argument('bird_name', help='English name for the bird (e.g. "Lapwing Crowned Flight call 2")')
    parser.add_argument('audio_path', help='Path to the audio recording file')
    parser.add_argument('--copy-from', dest='copy_from', help='Copy metadata from this existing bird entry')
    parser.add_argument('--xc-id', dest='xc_id', help='Xeno-Canto ID (e.g. XC123456). If not provided, uses USER##### format')
    args = parser.parse_args()

    # Validate input
    if not os.path.exists(args.audio_path):
        print(f"ERROR: Audio file not found: {args.audio_path}")
        sys.exit(1)

    if not os.path.exists('allbirds.js'):
        print("ERROR: allbirds.js not found. Run this script from the BestRunDay project root.")
        sys.exit(1)

    if not os.path.isdir('All birds'):
        print("ERROR: 'All birds' directory not found.")
        sys.exit(1)

    # Determine XC ID
    if args.xc_id:
        xc_id = args.xc_id if args.xc_id.startswith('XC') else f'XC{args.xc_id}'
    else:
        # Try to detect XC ID from the source filename
        src_basename = os.path.basename(args.audio_path)
        xc_match = re.search(r'(XC\d+)', src_basename)
        if xc_match:
            xc_id = xc_match.group(1)
            print(f"  Auto-detected XC ID from filename: {xc_id}")
        else:
            # Generate a unique user ID
            existing = os.listdir('All birds')
            user_ids = [int(re.search(r'USER(\d+)', f).group(1)) for f in existing if re.search(r'USER(\d+)', f)]
            next_id = max(user_ids, default=0) + 1
            xc_id = f'USER{next_id:05d}'

    # Create filename
    clean_name = sanitize_filename(args.bird_name)
    mp3_filename = f'{xc_id}_{clean_name}.mp3'
    mp3_path = os.path.join('All birds', mp3_filename)

    print(f"\n=== Adding new reference ===")
    print(f"  Bird name: {args.bird_name}")
    print(f"  Source: {args.audio_path}")
    print(f"  Target: {mp3_path}")

    # Step 1: Convert and copy audio
    print(f"\n[1/3] Converting audio to MP3...")
    ext = os.path.splitext(args.audio_path)[1].lower()
    if ext == '.mp3':
        shutil.copy2(args.audio_path, mp3_path)
        print(f"  Copied (already MP3)")
    else:
        if convert_to_mp3(args.audio_path, mp3_path):
            print(f"  Converted to: {mp3_path}")
        else:
            print("  ERROR: Conversion failed!")
            sys.exit(1)

    # Step 2: Add entry to allbirds.js
    print(f"\n[2/3] Adding entry to allbirds.js...")
    with open('allbirds.js', 'r', encoding='utf-8') as f:
        content = f.read()

    # Find existing entry to copy metadata from
    if args.copy_from:
        existing_entry, existing_name = find_existing_entry(content, args.copy_from)
    else:
        # Try to find by first two words of bird_name
        words = args.bird_name.split()
        search = ' '.join(words[:2]) if len(words) >= 2 else words[0]
        existing_entry, existing_name = find_existing_entry(content, search)

    audio_rel_path = f'All birds/{mp3_filename}'
    png_filename = mp3_filename.replace('.mp3', '.png')
    jpg_filename = mp3_filename.replace('.mp3', '.jpg')

    if existing_entry:
        print(f"  Copying metadata from: {existing_name}")
        # Replace key fields in the existing entry
        new_entry = existing_entry
        new_entry = re.sub(r'english:\s*"[^"]*"', f'english: "{args.bird_name}"', new_entry)
        new_entry = re.sub(r'audio:\s*"[^"]*"', f'audio: "{audio_rel_path}"', new_entry)
        new_entry = re.sub(r'spectrogram:\s*"[^"]*"', f'spectrogram: "All birds/{png_filename}"', new_entry)
        new_entry = re.sub(r'image:\s*"[^"]*"', f'image: "All birds/{jpg_filename}"', new_entry)
        new_entry = re.sub(r'credit:\s*"[^"]*"', f'credit: "User recording, {xc_id}"', new_entry)
    else:
        print(f"  No existing entry found — creating basic entry")
        new_entry = (
            f'{{english: "{args.bird_name}", afrikaans: "", '
            f'hotspot: "", habitat: "", birdgroup: "", level: "2 Intermediate", '
            f'audio: "{audio_rel_path}", '
            f'spectrogram: "All birds/{png_filename}", '
            f'image: "All birds/{jpg_filename}", '
            f'photographer: "", credit: "User recording, {xc_id}", '
            f'licenseLink: "", changes: "", '
            f'difficulty: 2, photoDifficulty: 2, specDifficulty: 3, exclude: false}}'
        )

    # Check if audio path already exists in allbirds.js
    if audio_rel_path in content:
        print(f"  WARNING: {audio_rel_path} already exists in allbirds.js — skipping")
    else:
        # Insert before the last closing bracket of the array
        # Find the last entry (last '},' or '}' before end)
        last_entry_end = content.rfind('},')
        if last_entry_end == -1:
            last_entry_end = content.rfind('}')
        
        if last_entry_end >= 0:
            insert_pos = last_entry_end + 2  # after '},'
            content = content[:insert_pos] + '\n\n' + new_entry + ',\n' + content[insert_pos:]
            
            with open('allbirds.js', 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"  Added entry: {args.bird_name}")
        else:
            print("  ERROR: Could not find insertion point in allbirds.js")
            sys.exit(1)

    # Step 3: Recompute features
    print(f"\n[3/3] Recomputing audio features...")
    print(f"  Running precompute_js_compatible.py...\n")
    
    import subprocess
    result = subprocess.run(
        [sys.executable, 'precompute_js_compatible.py'],
        cwd=os.path.dirname(os.path.abspath(__file__)) or '.'
    )
    
    if result.returncode == 0:
        print(f"\n=== SUCCESS ===")
        print(f"  Added: {args.bird_name}")
        print(f"  Audio: {mp3_path}")
        print(f"  Features: bird_audio_features.json (updated)")
        print(f"\n  Refresh the browser to use the new reference!")
    else:
        print(f"\n  ERROR: Feature extraction failed!")
        sys.exit(1)


if __name__ == '__main__':
    main()
