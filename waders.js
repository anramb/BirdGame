const waders = [
{ english:"African Jacana", afrikaans:"Grootlangtoon", hotspot:"Kruger National Park; Nylsvley", habitat:"Wetland", birdgroup:"Waders", level: "1 Beginner",
  audio:"waders/XC651037_AfricanJacana.mp3", spectrogram: "waders/XC651037_AfricanJacana.png", image: "waders/XC651037_AfricanJacana.jpg", credit:"© Tony Archer, www.xeno-canto.org, XC651037", licenseLink:"https://creativecommons.org/licenses/by-nc-sa/4.0/", changes:"Original recording"},
  
{ english:"Striped Crake", afrikaans:"Gestreepte Riethaan", hotspot:"Nylsvley; Zaagkuildrift", habitat:"Wetland", birdgroup:"Waders", level: "3 Advanced",
  audio:"waders/XC1079092_StripedCrake.mp3", spectrogram: "waders/XC1079092_StripedCrake.png", image: "waders/XC1079092_StripedCrake.jpg", credit:"© Niall Perrins, www.xeno-canto.org, XC1079092", licenseLink:"https://creativecommons.org/licenses/by-nc-sa/4.0/", changes:"Original recording"},

{ english:"Black Crake", afrikaans:"Swartriethaan", hotspot:"Kruger National Park", habitat:"Wetland", birdgroup:"Waders", level: "1 Beginner",
  audio:"waders/XC475084_BlackCrake.mp3", spectrogram: "waders/XC475084_BlackCrake.png", image: "waders/XC475084_BlackCrake.jpg", credit:"© Tony Archer, www.xeno-canto.org, XC475084", licenseLink:"https://creativecommons.org/licenses/by-nc-sa/4.0/", changes:"Original recording"},

{ english: "Allen's Gallinule", afrikaans: "Kleinkoningriethaan", hotspot: "Nylsvley; Zaagkuildrift", habitat: "Wetland", birdgroup: "Waders", level: "3 Advanced",
  audio: "waders/XC1081358_AllensGallinule.mp3", spectrogram: "waders/XC1081358_AllensGallinule.png", image: "waders/XC1081358_AllensGallinule.jpg", credit: "© Peter Boesman, www.xeno-canto.org, XC1081358", licenseLink: "https://creativecommons.org/licenses/by-nc-nd/4.0/", changes: "Original recording"},

{ english: "African Swamphen", afrikaans: "Grootkoningriethaan", hotspot: "Marievale Bird Sanctuary; Nylsvley; Zaagkuildrift", habitat: "Wetland", birdgroup: "Waders", level: "2 Intermediate",
  audio: "waders/XC276894_AfricanSwamphen.mp3", spectrogram: "waders/XC276894_AfricanSwamphen.png", image: "waders/XC276894_AfricanSwamphen.jpg", credit: "© Andrew Spencer, www.xeno-canto.org, XC276894", licenseLink: "https://creativecommons.org/licenses/by-nc-nd/4.0/", changes: "Original recording"},

{ english: "Lesser Jacana", afrikaans: "Dwerglangtoon", hotspot: "Bwabwata National Park", habitat: "Wetland", birdgroup: "Waders", level: "3 Advanced",
 audio: "waders/XC791510_LesserJacana.mp3", spectrogram: "waders/XC791510_LesserJacana.png", image: "waders/XC791510_LesserJacana.jpg", credit: "© Dries Van de Loock, www.xeno-canto.org, XC791510", licenseLink: "https://creativecommons.org/licenses/by-nc-nd/4.0/", changes: "Original recording"},

{ english: "African Rail", afrikaans: "Grootriethaan", hotspot: "Marievale Bird Sanctuary", habitat: "Wetland", birdgroup: "Waders", level: "2 Intermediate",
  audio: "waders/XC347035_AfricanRail.mp3", spectrogram: "waders/XC347035_AfricanRail.png", image: "waders/XC347035_AfricanRail.jpg", credit: "© Peter Boesman, www.xeno-canto.org, XC347035", licenseLink: "https://creativecommons.org/licenses/by-nc-nd/4.0/", changes: "Original recording"},
  
{ english: "African Snipe", afrikaans: "Afrikaanse Snip", hotspot: "Marievale Bird Sanctuary; Zaagkuildrift", habitat: "Wetland", birdgroup: "Waders", level: "2 Intermediate",
  audio: "waders/XC495341_AfricanSnipe.mp3", spectrogram: "waders/XC495341_AfricanSnipe.png", image: "waders/XC495341_AfricanSnipe.jpg", credit: "© Tony Archer, www.xeno-canto.org, XC495341", licenseLink: "https://creativecommons.org/licenses/by-nc-sa/4.0/", changes: "Original recording"},

{ english: "African Crake", afrikaans: "Afrikaanse Riethaan", hotspot: "Marievale Bird Sanctuary; Nylsvley; Zaagkuildrift", habitat: "Wetland", birdgroup: "Waders", level: "3 Advanced",
  audio: "waders/XC39321_AfricanCrake.mp3", spectrogram: "waders/XC39321_AfricanCrake.png", image: "waders/XC39321_AfricanCrake.jpg", credit: "© Derek Solomon, www.xeno-canto.org, XC39321", licenseLink: "https://creativecommons.org/licenses/by-nc-nd/2.5/", changes: "Original recording"},

{english: "Long-toed Lapwing", afrikaans: "Witvlerkkiewiet", hotspot: "Caprivi River System", habitat: "Wetland", birdgroup: "Lapwings", level: "3 Advanced",
 audio: "waders/XC740061_Long-toedLapwing.mp3", spectrogram: "waders/XC740061_Long-toedLapwing.png", image: "waders/XC740061_Long-toedLapwing.jpg", credit: "© Peter Boesman, www.xeno-canto.org, XC740061", licenseLink: "https://creativecommons.org/licenses/by-nc-nd/4.0/", changes: "Original recording"},

{english: "Hamerkop", afrikaans: "Hamerkop", hotspot: "Zaagkuildrift", habitat: "Wetland", birdgroup: "Waders", level: "1 Beginner",
 audio: "waders/XC269286_Hamerkop.mp3", spectrogram: "waders/XC269286_Hamerkop.png", image: "waders/XC269286_Hamerkop.jpg", credit: "© Andrew Spencer, www.xeno-canto.org, XC269286; More than 1 individual calling", licenseLink: "https://creativecommons.org/licenses/by-nc-nd/4.0/", changes: "Original recording"},

{english: "Buff-spotted Flufftail", afrikaans: "Gevlekte Vleikuiken", hotspot: "St Lucia; Drakensberg", habitat: "Forest", birdgroup: "Waders", level: "3 Advanced",
 audio: "waders/XC1097222_Buff-spottedFlufftail.mp3", spectrogram: "waders/XC1097222_Buff-spottedFlufftail.png", image: "waders/XC1097222_Buff-spottedFlufftail.jpg", credit: "© Marna Buys, www.xeno-canto.org, XC1097222, Background birds: Bar-throated apalis, Dark-capped bulbul", licenseLink: "https://creativecommons.org/licenses/by-nc-sa/4.0/", changes: "Original recording"},

{english: "Red-chested Flufftail Call male", afrikaans: "Rooiborsvleikuiken male", hotspot: "Marievale Bird Sanctuary; Rietvleidam Nature Reserve", habitat: "Forest", birdgroup: "Waders", level: "3 Advanced",
 audio: "waders/XC520141_Red-chestedFlufftail.mp3", spectrogram: "waders/XC520141_Red-chestedFlufftail.png", image: "waders/XC520141_Red-chestedFlufftail.jpg", credit: "© Tony Archer, www.xeno-canto.org, XC520141", licenseLink: "https://creativecommons.org/licenses/by-nc-sa/4.0/", changes: "Original recording"},

{english: "Red-chested Flufftail territorial call", afrikaans: "Rooiborsvleikuiken territorial call", hotspot: "Marievale Bird Sanctuary; Rietvleidam Nature Reserve", habitat: "Forest", birdgroup: "Waders", level: "3 Advanced",
 audio: "waders/XC546433_Red-chestedFlufftail.mp3", spectrogram: "waders/XC546433_Red-chestedFlufftail.png", image: "waders/XC546433_Red-chestedFlufftail.jpg", credit: "© Dries Van de Loock, www.xeno-canto.org, XC546433", licenseLink: "https://creativecommons.org/licenses/by-nc-sa/4.0/", changes: "Original recording"},

{ english:"Common Greenshank",  afrikaans:"Groenpootruiter", hotspot:"Marievale Bird Sanctuary", habitat:"Wetland", birdgroup:"Waders", level: "2 Intermediate",
  audio:"waders/XC670128_CommonGreenshank.mp3", spectrogram: "waders/XC670128_CommonGreenshank.png", image: "waders/XC670128_CommonGreenshank.jpg", credit:"© Tim Cockroft, www.xeno-canto.org, XC670128", licenseLink:"https://creativecommons.org/licenses/by-nc-sa/4.0/", changes:"Original recording"}

];
