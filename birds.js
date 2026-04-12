const birds = [
  
{ english:"African Jacana", afrikaans:"Grootlangtoon", hotspot:"Kruger National Park; Nylsvley", habitat:"Wetland", birdgroup:"Waders", level: "1 Beginner",
  audio:"XC651037_AfricanJacana.mp3", spectrogram: "XC651037_AfricanJacana.png", credit:"© Tony Archer, www.xeno-canto.org, XC651037", licenseLink:"https://creativecommons.org/licenses/by-nc-sa/4.0/", changes:"Original recording"},
  
{ english:"Striped Crake", afrikaans:"Gestreepte Riethaan", hotspot:"Nylsvley; Zaagkuildrift", habitat:"Wetland", birdgroup:"Waders", level: "3 Advanced",
  audio:"XC1079092_StripedCrake.mp3", spectrogram: "XC1079092_StripedCrake.png", credit:"© Niall Perrins, www.xeno-canto.org, XC1079092", licenseLink:"https://creativecommons.org/licenses/by-nc-sa/4.0/", changes:"Original recording"},

{ english:"Black Crake", afrikaans:"Swartriethaan", hotspot:"Kruger National Park", habitat:"Wetland", birdgroup:"Waders", level: "1 Beginner",
  audio:"XC475084_BlackCrake.mp3", spectrogram: "XC475084_BlackCrake.png", credit:"© Tony Archer, www.xeno-canto.org, XC475084", licenseLink:"https://creativecommons.org/licenses/by-nc-sa/4.0/", changes:"Original recording"},

{ english: "Allen's Gallinule", afrikaans: "Kleinkoningriethaan", hotspot: "Nylsvley; Zaagkuildrift", habitat: "Wetland", birdgroup: "Waders", level: "3 Advanced",
  audio: "XC1081358_AllensGallinule.mp3", spectrogram: "XC1081358_AllensGallinule.png", credit: "© Peter Boesman, www.xeno-canto.org, XC1081358", licenseLink: "https://creativecommons.org/licenses/by-nc-nd/4.0/", changes: "Original recording"},

{ english: "African Swamphen", afrikaans: "Grootkoningriethaan", hotspot: "Marievale Bird Sanctuary; Nylsvley; Zaagkuildrift", habitat: "Wetland", birdgroup: "Waders", level: "2 Intermediate",
  audio: "XC276894_AfricanSwamphen.mp3", spectrogram: "XC276894_AfricanSwamphen.png", credit: "© Andrew Spencer, www.xeno-canto.org, XC276894", licenseLink: "https://creativecommons.org/licenses/by-nc-nd/4.0/", changes: "Original recording"},

{ english: "Fulvous Whistling Duck", afrikaans: "Fluiteend", hotspot: "Zaagkuildrift", habitat: "Wetland", birdgroup: "Ducks&Geese", level: "2 Intermediate",
  audio: "XC280235_FulvousWhistlingDuck.mp3", spectrogram: "XC280235_FulvousWhistlingDuck.png", credit: "© Peter Boesman, www.xeno-canto.org, XC280235", licenseLink: "https://creativecommons.org/licenses/by-nc-nd/4.0/", changes: "Original recording"},
  
{ english: "African Black Duck", afrikaans: "Swarteend", hotspot: "Marievale Bird Sanctuary; Zaagkuildrift", habitat: "Wetland", birdgroup: "Ducks&Geese", level: "1 Beginner",
 audio: "XC615647_AfricanBlackDuck.mp3", spectrogram: "XC615647_AfricanBlackDuck.png", credit: "© Nature sounds by Simply Birding, www.xeno-canto.org, XC615647", licenseLink: "https://creativecommons.org/licenses/by-nc-nd/4.0/", changes: "Original recording"},

{ english: "Spur-winged Goose",  afrikaans: "Wildemakou",  hotspot: "Marievale Bird Sanctuary; Zaagkuildrift", habitat: "Wetland", birdgroup: "Ducks&Geese", level: "1 Beginner",
  audio: "XC126343_Spur-wingedGoose.mp3", spectrogram: "XC126343_Spur-wingedGoose.png", credit: "© Sander Bot, www.xeno-canto.org, XC126343", licenseLink: "https://creativecommons.org/licenses/by-nc-sa/3.0/", changes: "Original recording"},

{ english: "Lesser Jacana", afrikaans: "Dwerglangtoon", hotspot: "Bwabwata National Park", habitat: "Wetland", birdgroup: "Waders", level: "3 Advanced",
 audio: "XC791510_LesserJacana.mp3", spectrogram: "XC791510_LesserJacana.png", credit: "© Dries Van de Loock, www.xeno-canto.org, XC791510", licenseLink: "https://creativecommons.org/licenses/by-nc-nd/4.0/", changes: "Original recording"},

{ english: "African Rail", afrikaans: "Grootriethaan", hotspot: "Marievale Bird Sanctuary", habitat: "Wetland", birdgroup: "Waders", level: "2 Intermediate",
  audio: "XC347035_AfricanRail.mp3", spectrogram: "XC347035_AfricanRail.png", credit: "© Peter Boesman, www.xeno-canto.org, XC347035", licenseLink: "https://creativecommons.org/licenses/by-nc-nd/4.0/", changes: "Original recording"},
  
{ english: "African Snipe", afrikaans: "Afrikaanse Snip", hotspot: "Marievale Bird Sanctuary; Zaagkuildrift", habitat: "Wetland", birdgroup: "Waders", level: "2 Intermediate",
  audio: "XC495341_AfricanSnipe.mp3", spectrogram: "XC495341_AfricanSnipe.png", credit: "© Tony Archer, www.xeno-canto.org, XC495341", licenseLink: "https://creativecommons.org/licenses/by-nc-sa/4.0/", changes: "Original recording"},

{ english: "African Crake", afrikaans: "Afrikaanse Riethaan", hotspot: "Marievale Bird Sanctuary; Nylsvley; Zaagkuildrift", habitat: "Wetland", birdgroup: "Waders", level: "3 Advanced",
  audio: "XC39321_AfricanCrake.mp3", spectrogram: "XC39321_AfricanCrake.png", credit: "© Derek Solomon, www.xeno-canto.org, XC39321", licenseLink: "https://creativecommons.org/licenses/by-nc-nd/2.5/", changes: "Original recording"},

{english: "Chirping Cisticola", afrikaans: "Piepende Tinktinkie", hotspot: "Caprivi River System", habitat: "Riverine shrubs", birdgroup: "Cisticola", 
 audio: "XC339101_ChirpingCisticola.mp3", spectrogram: "XC339101_ChirpingCisticola.png",credit: "© Peter Boesman, www.xeno-canto.org, XC339101", licenseLink: "https://creativecommons.org/licenses/by-nc-nd/4.0/", changes: "Original recording"},

{english: "Long-toed Lapwing", afrikaans: "Witvlerkkiewiet", hotspot: "Caprivi River System", habitat: "Wetland", birdgroup: "Lapwings", 
 audio: "XC740061_Long-toedLapwing.mp3", spectrogram: "XC740061_Long-toedLapwing.png",credit: "© Peter Boesman, www.xeno-canto.org, XC740061", licenseLink: "https://creativecommons.org/licenses/by-nc-nd/4.0/", changes: "Original recording"},

{english: "Luapula Cisticola", afrikaans: "Luapulatinktinkie", hotspot: "Caprivi River System", habitat: "Grassland", birdgroup: "Cisticola", 
 audio: "XC978973_LuapulaCisticola.mp3", spectrogram: "XC978973_LuapulaCisticola.png",credit: "© Dries Van de Loock, www.xeno-canto.org, XC978973", licenseLink: "https://creativecommons.org/licenses/by-nc-nd/4.0/", changes: "Original recording"},

{english: "Hamerkop", afrikaans: "Hamerkop", hotspot: "Zaagkuildrift", habitat: "Wetland", birdgroup: "Waders", 
 audio: "XC269286_Hamerkop.mp3", spectrogram: "XC269286_Hamerkop.png",credit: "© Andrew Spencer, www.xeno-canto.org, XC269286; More than 1 individual calling", licenseLink: "https://creativecommons.org/licenses/by-nc-nd/4.0/", changes: "Original recording"},

{english: "Little Bittern", afrikaans: "Kleinrietreier", hotspot: "Marievale Bird Sanctuary", habitat: "Wetland", birdgroup: "Egrets & Herons", 
 audio: "XC599094_LittleBittern.mp3", spectrogram: "XC599094_LittleBittern.png",credit: "© Tony Archer, www.xeno-canto.org, XC599094; Background birds: Lesser Swamp Warbler", licenseLink: "https://creativecommons.org/licenses/by-nc-sa/4.0/", changes: "Original recording"},

{english: "Dwarf Bittern", afrikaans: "Dwergrietreier", hotspot: "Zaagkuildrift", habitat: "Wetland", birdgroup: "Egrets & Herons", 
 audio: "XC827385_DwarfBittern.mp3", spectrogram: "XC827385_DwarfBittern.png",credit: "© Ehren Eksteen, www.xeno-canto.org, XC827385; Background birds: Cape Turtle (RIng-necked) Dove, Woodland Kingfisher", licenseLink: "https://creativecommons.org/licenses/by-nc-sa/4.0/", changes: "Original recording"},

{english: "Black-crowned Night Heron", afrikaans: "Gewone Nagreier", hotspot: "Zaagkuildrift", habitat: "Wetland", birdgroup: "Egrets & Herons", 
 audio: "XC280512_Black-crownedNightHeron.mp3", spectrogram: "XC280512_Black-crownedNightHeron.png",credit: "© Peter Boesman, www.xeno-canto.org, XC280512", licenseLink: "https://creativecommons.org/licenses/by-nc-nd/4.0/", changes: "Original recording"},

{english: "Squacco Heron", afrikaans: "Ralreier", hotspot: "Zaagkuildrift", habitat: "Wetland", birdgroup: "Egrets & Herons", 
 audio: "XC299963_SquaccoHeron.mp3", spectrogram: "XC299963_SquaccoHeron.png",credit: "© Peter Boesman, www.xeno-canto.org, XC299963", licenseLink: "https://creativecommons.org/licenses/by-nc-nd/4.0/", changes: "Original recording"},

{english: "Buff-spotted Flufftail", afrikaans: "Gevlekte Vleikuiken", hotspot: "St Lucia; Drakensberg", habitat: "Forest", birdgroup: "Flufftail", 
 audio: "XC1097222_Buff-spottedFlufftail.mp3", spectrogram: "XC1097222_Buff-spottedFlufftail.png",credit: "© Marna Buys, www.xeno-canto.org, XC1097222, Background birds: Bar-throated apalis, Dark-capped bulbul", licenseLink: "https://creativecommons.org/licenses/by-nc-sa/4.0/", changes: "Original recording"},

{english: "Red-chested Flufftail Call 1", afrikaans: "Rooiborsvleikuiken 1", hotspot: "Marievale Bird Sanctuary; Rietvleidam Nature Reserve", habitat: "Forest", birdgroup: "Flufftail", 
 audio: "XC520141_Red-chestedFlufftail.mp3", spectrogram: "XC520141_Red-chestedFlufftail.png",credit: "© Tony Archer, www.xeno-canto.org, XC520141", licenseLink: "https://creativecommons.org/licenses/by-nc-sa/4.0/", changes: "Original recording"},

{english: "Red-chested Flufftail Call 2", afrikaans: "Rooiborsvleikuiken 2", hotspot: "Marievale Bird Sanctuary; Rietvleidam Nature Reserve", habitat: "Forest", birdgroup: "Flufftail", 
 audio: "XC546433_Red-chestedFlufftail.mp3", spectrogram: "XC546433_Red-chestedFlufftail.png",credit: "© Dries Van de Loock, www.xeno-canto.org, XC546433", licenseLink: "https://creativecommons.org/licenses/by-nc-sa/4.0/", changes: "Original recording"},
  
{ english:"Common Greenshank",  afrikaans:"Groenpootruiter", hotspot:"Marievale Bird Sanctuary", habitat:"Wetland", birdgroup:"Waders", level: "2 Intermediate",
  audio:"XC670128_CommonGreenshank.mp3", spectrogram: "XC670128_CommonGreenshank.png", credit:"© Tim Cockroft, www.xeno-canto.org, XC670128", licenseLink:"https://creativecommons.org/licenses/by-nc-sa/4.0/", changes:"Original recording"}
  
];
