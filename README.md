# Bird Sound ID App

'n Voëlgeluid identifikasie applicasie om jou voëlgeluide te leer ken.

## Files Structure

```
BestRunDay/
├── index.html              # Main HTML file
├── app.js                  # Main application logic
├── cisticolas.js           # Cisticolas bird data
├── gardenwoodland.js       # Garden and Woodland bird data
├── groundbirds.js          # Groundbirds bird data
├── LBJs.js                 # LBJs bird data
├── other.js                # Other bird data
├── raptors.js              # Raptors bird data
├── seedeaters.js           # Seedeaters bird data
├── waders.js               # Waders bird data
├── warblers.js             # Warblers bird data
├── waterbirds.js           # Waterbirds bird data
├── cisticolas/             # Folder with cisticolas media files
├── gardenwoodland/         # Folder with gardenwoodland media files
├── groundbirds/            # Folder with groundbirds media files
├── LBJs/                   # Folder with LBJs media files
├── other/                  # Folder with other media files
├── raptors/                # Folder with raptors media files
├── seedeaters/             # Folder with seedeaters media files
├── waders/                 # Folder with waders media files
├── warblers/               # Folder with warblers media files
└── waterbirds/             # Folder with waterbirds media files
```

## How to Add New Birds

### 1. Add Media Files
Place the following files in the appropriate category folder:
- `BirdName.mp3` - Audio recording
- `BirdName.png` - Spectrogram image
- `BirdName.jpg` - Bird photograph

### 2. Add Bird Data
Add the bird object to the appropriate JavaScript file (e.g., `cisticolas.js`):

```javascript
{english: "Bird Name", afrikaans: "Voël Naam", hotspot: "Location1; Location2", habitat: "HabitatType", birdgroup: "Group Name", level: "1 Beginner", 
 audio: "cisticolas/BirdName.mp3", spectrogram: "cisticolas/BirdName.png", image: "cisticolas/BirdName.jpg", credit: "© Recorder Name, www.xeno-canto.org, XC123456", licenseLink: "https://creativecommons.org/licenses/by-nc-sa/4.0/", changes: "Original recording"}
```

### 3. Required Properties
Each bird object must have ALL these properties:
- `english` - English name
- `afrikaans` - Afrikaans name
- `hotspot` - Locations separated by semicolons
- `habitat` - Habitat type
- `birdgroup` - Bird group
- `level` - "1 Beginner", "2 Intermediate", or "3 Advanced"
- `audio` - Path to MP3 file
- `spectrogram` - Path to PNG spectrogram
- `image` - Path to JPG bird photo
- `credit` - Recording credit
- `licenseLink` - License URL
- `changes` - Any changes made to original

### 4. Adding New Categories
To add a new bird category:

1. Create new JavaScript file (e.g., `newcategory.js`)
2. Add the script tag to `index.html`
3. Add the category to the `allData` object in `app.js`
4. Add the category option to the select dropdown in `index.html`

## Fixed Issues

The following issues were resolved:
- ✅ Missing `image` properties in several bird data files
- ✅ Inconsistent formatting in `waders.js`
- ✅ All bird objects now have complete property sets
- ✅ Proper syntax and structure throughout

## Usage

1. Open `index.html` in a web browser
2. Select a bird category
3. Choose filters (optional)
4. Click "Start / Play / Pause" to begin
5. Listen to the bird sound and identify the bird
6. Click an answer to see if you're correct
7. Use "Review" to practice mistakes

## Tips for Adding Birds

- Keep file names consistent and descriptive
- Use the same naming convention: `XC123456_BirdName`
- Verify all file paths are correct
- Test each new bird to ensure it works properly
- Keep credit information accurate and complete
