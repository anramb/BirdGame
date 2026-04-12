const birds = [
  
{ english:"African Jacana", afrikaans:"Grootlangtoon", hotspot:"Kruger National Park; Nylsvley", habitat:"Wetland", birdgroup:"Waders", level: "1 Beginner",
  audio:"XC651037_AfricanJacana.mp3", spectrogram: "XC651037_AfricanJacana.png", credit:"Tony Archer", licenseLink:"https://creativecommons.org/licenses/by-nc-sa/4.0/", changes:"Original recording"},
  
{ english:"Striped Crake", afrikaans:"Gestreepte Riethaan", hotspot:"Nylsvley; Zaagkuildrift", habitat:"Wetland", birdgroup:"Waders", level: "3 Advanced",
  audio:"XC1079092_StripedCrake.mp3", spectrogram: "XC1079092_StripedCrake.png", credit:"Niall Perrins", licenseLink:"https://creativecommons.org/licenses/by-nc-sa/4.0/", changes:"Original recording"},

{ english:"Black Crake", afrikaans:"Swartriethaan", hotspot:"Kruger National Park", habitat:"Wetland", birdgroup:"Waders", level: "1 Beginner",
  audio:"XC475084_BlackCrake.mp3", spectrogram: "XC475084_BlackCrake.png", credit:"Tony Archer", licenseLink:"https://creativecommons.org/licenses/by-nc-sa/4.0/", changes:"Original recording"},

{ english: "Allen's Gallinule", afrikaans: "Kleinkoningriethaan", hotspot: "Nylsvley; Zaagkuildrift", habitat: "Wetland", birdgroup: "Waders", level: "3 Advanced",
  audio: "XC1081358_AllensGallinule.mp3", spectrogram: "XC1081358_AllensGallinule.png", credit: "Credit: Peter Boesman, Xeno-Canto", licenseLink: "https://creativecommons.org/licenses/by-nc-nd/4.0/", changes: "Original recording"},

{ english: "African Swamphen", afrikaans: "Grootkoningriethaan", hotspot: "Marievale Bird Sanctuary; Nylsvley; Zaagkuildrift", habitat: "Wetland", birdgroup: "Waders", level: "2 Intermediate",
  audio: "XC276894_AfricanSwamphen.mp3", spectrogram: "XC276894_AfricanSwamphen.png", credit: "Andrew Spencer", licenseLink: "https://creativecommons.org/licenses/by-nc-nd/4.0/", changes: "Original recording"},

{ english: "Fulvous Whistling Duck", afrikaans: "Fluiteend", hotspot: "Zaagkuildrift", habitat: "Wetland", birdgroup: "Ducks&Geese", level: "2 Intermediate",
  audio: "XC280235_FulvousWhistlingDuck.mp3", spectrogram: "XC280235_FulvousWhistlingDuck.png", credit: "Peter Boesman", licenseLink: "https://creativecommons.org/licenses/by-nc-nd/4.0/", changes: "Original recording"},
  
{ english: "African Black Duck", afrikaans: "Swarteend", hotspot: "Marievale Bird Sanctuary; Zaagkuildrift", habitat: "Wetland", birdgroup: "Ducks&Geese", level: "1 Beginner",
 audio: "XC615647_AfricanBlackDuck.mp3", spectrogram: "XC615647_AfricanBlackDuck.png", credit: "Nature sounds by Simply Birding", licenseLink: "https://creativecommons.org/licenses/by-nc-nd/4.0/", changes: "Original recording"},

{ english: "Spur-winged Goose",  afrikaans: "Wildemakou",  hotspot: "Marievale Bird Sanctuary; Zaagkuildrift", habitat: "Wetland", birdgroup: "Ducks&Geese", level: "1 Beginner",
  audio: "XC126343_Spur-wingedGoose.mp3", spectrogram: "XC126343_Spur-wingedGoose.png", credit: "Sander Bot", licenseLink: "https://creativecommons.org/licenses/by-nc-sa/3.0/", changes: "Original recording"},

{ english: "Lesser Jacana", afrikaans: "Dwerglangtoon", hotspot: "Bwabwata National Park", habitat: "Wetland", birdgroup: "Waders", level: "3 Advanced",
 audio: "XC791510_LesserJacana.mp3", spectrogram: "XC791510_LesserJacana.png", credit: "Dries Van de Loock", licenseLink: "https://creativecommons.org/licenses/by-nc-nd/4.0/", changes: "Original recording"},

{ english: "African Rail", afrikaans: "Grootriethaan", hotspot: "Marievale Bird Sanctuary", habitat: "Wetland", birdgroup: "Waders", level: "2 Intermediate",
  audio: "XC347035_AfricanRail.mp3", spectrogram: "XC347035_AfricanRail.png", credit: "Peter Boesman", licenseLink: "https://creativecommons.org/licenses/by-nc-nd/4.0/", changes: "Original recording"},
  
{ english: "African Snipe", afrikaans: "Afrikaanse Snip", hotspot: "Marievale Bird Sanctuary; Zaagkuildrift", habitat: "Wetland", birdgroup: "Waders", level: "2 Intermediate",
  audio: "XC495341_AfricanSnipe.mp3", spectrogram: "XC495341_AfricanSnipe.png", credit: "Credit: Tony Archer, Xeno-Canto", licenseLink: "https://creativecommons.org/licenses/by-nc-sa/4.0/", changes: "Original recording"},

{ english: "African Crake", afrikaans: "Afrikaanse Riethaan", hotspot: "Marievale Bird Sanctuary; Nylsvley; Zaagkuildrift", habitat: "Wetland", birdgroup: "Waders", level: "3 Advanced",
  audio: "XC39321_AfricanCrake.mp3", spectrogram: "XC39321_AfricanCrake.png", credit: "Credit: Derek Solomon", licenseLink: "https://creativecommons.org/licenses/by-nc-nd/2.5/", changes: "Original recording"},

{english: "Chirping Cisticola", afrikaans: "Piepende Tinktinkie", hotspot: "Caprivi River System", habitat: "Riverine shrubs", birdgroup: "Cisticola", 
 audio: "XC339101_ChirpingCisticola.mp3", spectrogram: "XC339101_ChirpingCisticola.png",credit: "Credit: Peter Boesman, Xeno-Canto", licenseLink: "https://creativecommons.org/licenses/by-nc-nd/4.0/", changes: "Original recording"},

{english: "Long-toed Lapwing", afrikaans: "Witvlerkkiewiet", hotspot: "Caprivi River System", habitat: "Wader", birdgroup: "Lapwings", 
 audio: "XC740061_Long-toedLapwing.mp3", spectrogram: "XC740061_Long-toedLapwing.png",credit: "Credit: Peter Boesman, Xeno-Canto", licenseLink: "https://creativecommons.org/licenses/by-nc-nd/4.0/", changes: "Original recording"},

{ english:"Common Greenshank",  afrikaans:"Groenpootruiter", hotspot:"Marievale Bird Sanctuary", habitat:"Wetland", birdgroup:"Waders", level: "2 Intermediate",
  audio:"XC670128_CommonGreenshank.mp3", spectrogram: "XC670128_CommonGreenshank.png", credit:"Tim Cockroft", licenseLink:"https://creativecommons.org/licenses/by-nc-sa/4.0/", changes:"Original recording"}
  
];
