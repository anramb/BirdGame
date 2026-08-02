# How to Add a New Bird

## Quick Version (One Command)

If you have the audio file and know the bird name:

```bash
cd C:\Users\anram\AndroidStudioProjects\BestRunDay
python add_reference.py "Bird Name Here" "C:\path\to\recording.wav" --copy-from "Existing Bird Name"
```

This does steps 1-3 automatically. Then do steps 4-6 manually.

---

## Detailed Step-by-Step

### Step 1: Prepare the audio file

- Download or record the bird call (WAV or MP3)
- Save it somewhere accessible, e.g. `C:\Users\anram\Downloads\MyBird.wav`
- Note the Xeno-Canto ID if applicable (e.g. XC1234567)

### Step 2: Open terminal in the project folder

```bash
cd C:\Users\anram\AndroidStudioProjects\BestRunDay
```

### Step 3: Run add_reference.py

**Basic usage:**
```bash
python add_reference.py "Warbler Garden song" "C:\Users\anram\Downloads\MyBird.wav"
```

**With metadata copied from an existing entry (recommended):**
```bash
python add_reference.py "Warbler Garden song" "C:\Users\anram\Downloads\MyBird.wav" --copy-from "Warbler Garden"
```

**With a specific Xeno-Canto ID:**
```bash
python add_reference.py "Warbler Garden song" "C:\Users\anram\Downloads\MyBird.wav" --copy-from "Warbler Garden" --xc-id XC1234567
```

This command automatically:
- Converts the audio to MP3 and copies it to `All birds/`
- Adds an entry to `allbirds.js` (copies hotspot, habitat, birdgroup, etc. from the `--copy-from` bird)
- Runs `precompute_js_compatible.py` which only processes the NEW entry (not all 730+)

### Step 4: Generate the spectrogram PNG

```bash
cd C:\Users\anram\AndroidStudioProjects\BestRunDay
python generate_spectrograms.py
```

This only generates PNGs for new audio files (skips existing ones).

### Step 5: Add a photo (optional)

- Name the photo the same as the audio file but with `.jpg` extension
  - e.g. if audio is `All birds/XC1234567_GardenWarbler.mp3`
  - then photo should be `All birds/XC1234567_GardenWarbler.jpg`
- If no photo, the app will just hide the photo area

### Step 6: Edit the allbirds.js entry (if needed)

Open `allbirds.js` and find the new entry. Check/update these fields:

| Field | Example | Notes |
|-------|---------|-------|
| `english` | `"Warbler Garden song"` | Species name + call type suffix |
| `afrikaans` | `"Sanger Tuin"` | Afrikaans name |
| `hotspot` | `"Kruger National Park Other; Wider Gauteng 100km/Nylsvley Other"` | Semicolon-separated, add `Other` or `Special` suffix |
| `habitat` | `"Woodland/Savanna; Forest/Forest edges"` | Semicolon-separated |
| `birdgroup` | `"Garden and Woodland"` | Must match existing groups |
| `level` | `"2 Intermediate"` | `1 Beginner`, `2 Intermediate`, or `3 Advanced` |
| `difficulty` | `2` | 1=easy, 2=medium, 3=hard (for game mode) |
| `photoDifficulty` | `2` | Photo difficulty for multiplayer |
| `specDifficulty` | `3` | Spectrogram difficulty |
| `credit` | `"© Author, www.xeno-canto.org, XC1234567"` | Recording credit |
| `licenseLink` | `"https://creativecommons.org/licenses/by-nc-sa/4.0/"` | License URL |
| `exclude` | `false` | Set `true` to hide from game mode |
| `identifyOnly` | `false` | Set `true` for clips used only in Sound ID matching (hidden from training/learning modes) |

### Step 7: Refresh the browser

That's it! Refresh the app in your browser to see the new bird.

---

## Naming Convention

**English name format:** `"[Species Group] [Species] [call type suffix]"`

Examples:
- `"Warbler Garden"` — main call
- `"Warbler Garden song"` — song variant
- `"Warbler Garden alarm call"` — alarm call
- `"Warbler Garden 2"` — second recording of main call
- `"Warbler Garden song 2"` — second recording of song

**Valid call type suffixes** (order matters for grouping):
`song & imitation`, `interaction m & f`, `male & female`, `2 birds interacting`, `advertising call`, `alarm call`, `territorial call`, `contact call`, `flight call`, `call variation`, `variation of call`, `call male`, `call female`, `courting male`, `duet`, `song`, `drumming`, `additional`, `immature`, `adult`, `juvenile`, `male`, `female`, `call`, `ec`, `wc`

---

## Available Hotspots

Use these exact names (with `Other` or `Special` suffix):
- Wider Gauteng 100km/Nylsvley
- Kruger National Park
- Kruger National Park Pafuri
- KZN
- Isimangaliso
- Drakensberg & Sani Pass
- Western Cape
- Garden Route
- Eastern Cape
- Free State
- Northern Cape/Kalahari/Karoo
- Limpopo
- Mpumalanga
- Northwest
- Magoebas/Soutpans-/Waterberg
- Caprivi/Chobe

Example: `"Kruger National Park Other; Kruger National Park Pafuri Special"`

---

## Available Habitats

- Woodland/Savanna
- Forest/Forest edges
- Grassland
- Wetland/Marsh
- Reedbeds/Mangrove
- Scrub/Shrub
- Fynbos
- Garden
- Rocky/Mountain
- Coastal
- Aerial
- Urban

Example: `"Woodland/Savanna; Forest/Forest edges"`

---

## Available Bird Groups

Cisticolas, Garden and Woodland, Groundbirds, LBJs, Raptors, Seedeaters, Waders, Waterbirds, Other

---

## Adding Identify-Only Clips (for Sound ID accuracy)

These are extra audio clips used **only** for matching in Sound ID. They don't appear in Single Select, Multiplayer, Learning Mode, or Spectro Challenge.

**Use case:** You have a short, clean segment of a bird call that would improve identification accuracy, but you don't want it shown as a playable entry.

### How to add:

1. Add the audio file to `All birds/` as usual
2. Add an entry to `allbirds.js` with `identifyOnly: true`
3. The entry still needs `english`, `afrikaans`, `hotspot`, `habitat`, etc.
4. No photo or spectrogram needed (they won't be shown)
5. Run browser precompute to generate features

**Example entry:**
```js
{english: "Shrike Magpie clip", afrikaans: "Laksman Langstertlaksman clip",
 hotspot: "Kruger National Park Other", habitat: "Woodland/Savanna",
 birdgroup: "Garden and Woodland", level: "1 Beginner", difficulty: 1,
 audio: "All birds/CLIP_MagpieShrike.mp3", spectrogram: "", image: "",
 identifyOnly: true, exclude: false, ...}
```

**How it works:**
- Sound ID includes these entries when comparing features
- If an identifyOnly clip matches better than the main entry, the score is transferred to the main species in the results
- Users never see or hear the identifyOnly clips directly

---

## If Something Goes Wrong

**Reprocess all features from scratch:**
```bash
cd C:\Users\anram\AndroidStudioProjects\BestRunDay
python precompute_js_compatible.py --force
```

**Regenerate all spectrograms:**
```bash
cd C:\Users\anram\AndroidStudioProjects\BestRunDay
python generate_spectrograms.py --force
```
