// Clean version - no infinite loops, no memory leaks
// All data derived from allbirds.js using birdgroup field
const birdgroupMap = {
  cisticolas: "Cisticolas",
  gardenwoodland: "Garden and Woodland",
  groundbirds: "Groundbirds",
  LBJs: "LBJs",
  other: "Other",
  raptors: "Raptors",
  seedeaters: "Seedeaters",
  waders: "Waders",
  warblers: "Warblers",
  waterbirds: "Waterbirds"
};

let allData = { allbirds: typeof allbirds !== 'undefined' ? allbirds : [] };
Object.entries(birdgroupMap).forEach(([key, group]) => {
  allData[key] = allData.allbirds.filter(bird => bird && bird.birdgroup === group);
});

// Species grouping - strip call-type suffixes to get base species name
const GAME_CALL_SUFFIXES = [
  'song & immitation', 'song & imitation',
  'interaction m & f', 'male & female',
  '2 birds interacting', 'advertising call',
  'alarm call', 'territorial call', 'contact call',
  'flight call', 'call variation', 'variation of call',
  'call male', 'call female', 'courting male',
  'duet', 'song', 'drumming', 'additional',
  'immature', 'adult', 'juvenile',
  'male', 'female',
  'call',
  'ec', 'wc'
];

function getBaseName(name) {
  let result = name.trim();
  let changed = true;
  while (changed) {
    changed = false;
    const lower = result.toLowerCase();
    for (const s of GAME_CALL_SUFFIXES) {
      if (lower.endsWith(' ' + s)) {
        result = result.substring(0, result.length - s.length - 1).trim();
        changed = true;
        break;
      }
    }
    if (!changed) {
      const numMatch = result.match(/\s\d+$/);
      if (numMatch) {
        result = result.substring(0, result.length - numMatch[0].length).trim();
        changed = true;
      }
    }
  }
  return result;
}

let birds = [];
let filtered = [];
let queue = [];
let currentBird = null;
let wrongAnswers = [];
let audio = new Audio();
let started = false;

// Game stats
let gameScore = 0;
let gameHighScore = parseInt(localStorage.getItem('birdGameHighScore')) || 0;
let gameStreak = 0;
let gameLongestStreak = parseInt(localStorage.getItem('birdGameLongestStreak')) || 0;
let gameTotalQuestions = 0;
let gameCorrectAnswers = 0;
let answered = false;

function loadCategory() {
  const cat = document.getElementById("category").value;
  birds = allData[cat] || [];
  console.log(`Loaded ${cat}: ${birds.length} birds`);
  updateFilterOptions();
}

function changeCategory() {
  loadCategory();
  started = false;
  queue = [];
  filtered = [];
  currentBird = null;
  wrongAnswers = [];
  audio.pause();
  document.getElementById("gameArea").style.display = "none";
  document.getElementById("info").innerHTML = "";
  document.getElementById("options").innerHTML = "";
}

function playAudio(file) {
  if (!file) return;
  audio.pause();
  audio.src = file;
  audio.play().catch(e => console.log("Audio play failed:", e));
}

function startOrPlay() {
  if (!started) {
    startGame();
    started = true;
  } else {
    audio.paused ? audio.play() : audio.pause();
  }
}

function getUnique(key) {
  const uniqueSet = new Set();
  birds.forEach(bird => {
    if (bird && bird[key]) {
      bird[key].split(";").forEach(v => {
        v = v.trim();
        if (v) uniqueSet.add(v);
      });
    }
  });
  return Array.from(uniqueSet);
}

function updateFilterOptions() {
  const type = document.getElementById("filterType").value;
  const sel = document.getElementById("filterValue");
  
  if (!sel) return;
  sel.innerHTML = "";

  if (type === "none") {
    sel.innerHTML = '<option value="">All</option>';
    return;
  }

  const values = getUnique(type).sort((a, b) => a.localeCompare(b));
  values.forEach(v => {
    sel.innerHTML += `<option value="${v}">${v}</option>`;
  });
}

function shuffle(array) {
  const arr = [...array];
  // Fisher-Yates shuffle algorithm for better randomization
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function startGame() {
  console.log("Starting game...");
  wrongAnswers = [];

  // Reset game stats for new game
  gameScore = 0;
  gameStreak = 0;
  gameTotalQuestions = 0;
  gameCorrectAnswers = 0;
  answered = false;
  updateScoreboard();

  const type = document.getElementById("filterType").value;
  const filterValueEl = document.getElementById("filterValue");
  const selectedValues = Array.from(filterValueEl.selectedOptions).map(o => o.value);
  const lvl = document.getElementById("levelFilter").value;

  filtered = birds.filter(bird => {
    if (!bird) return false;
    let match1 = true;
    if (type !== "none" && selectedValues.length > 0) {
      match1 = selectedValues.some(val => (bird[type] || "").toLowerCase().includes(val.toLowerCase()));
    }
    const match2 = !lvl || (bird.level || "").startsWith(lvl);
    return match1 && match2;
  });

  console.log(`Filtered ${filtered.length} birds`);
  
  // Create completely fresh shuffle for game start
  queue = shuffle([...filtered]);
  
  // Reset currentBird to ensure we don't reuse previous bird
  currentBird = null;

  document.getElementById("gameArea").style.display = "block";
  nextBird();
}

function nextBird() {
  if (!filtered || filtered.length === 0) {
    console.log("No birds available");
    return;
  }

  if (queue.length === 0) {
    console.log("Reshuffling queue...");
    queue = shuffle([...filtered]);
  }

  currentBird = queue.shift();
  console.log("Current bird:", currentBird?.english);
  console.log("Queue length:", queue.length);

  if (currentBird?.audio) {
    playAudio(currentBird.audio);
  }

  // Hide static spectrogram image - dynamic spectrogram is generated from audio
  const spec = document.getElementById("spectrogram");
  if (spec) {
    spec.style.display = "none";
  }

  const img = document.getElementById("birdImage");
  img.style.display = "none";
  img.style.opacity = 0;

  // Hide copyright overlay when starting new bird
  const copyrightOverlay = document.getElementById("copyrightOverlay");
  if (copyrightOverlay) {
    copyrightOverlay.style.display = "none";
  }

  answered = false;
  createOptions();
  document.getElementById("info").innerHTML = "";
}

function createOptions() {
  if (!currentBird) return;

  const currentBase = getBaseName(currentBird.english);
  let options = [currentBird.english];
  let usedBases = [currentBase];
  const pool = filtered.filter(b => b.english !== currentBird.english);

  while (options.length < 4 && pool.length > 0) {
    const randomIndex = Math.floor(Math.random() * pool.length);
    const randomBird = pool[randomIndex];
    const randomBase = getBaseName(randomBird.english);
    if (!usedBases.includes(randomBase)) {
      options.push(randomBird.english);
      usedBases.push(randomBase);
    }
    pool.splice(randomIndex, 1);
  }

  options = shuffle(options);

  const lang = document.getElementById("lang").value;
  const optionsDiv = document.getElementById("options");
  optionsDiv.innerHTML = "";

  options.forEach(option => {
    const birdObj = filtered.find(b => b.english === option);
    if (!birdObj) return;

    const btn = document.createElement("button");
    btn.textContent = lang === "af" ? getBaseName(birdObj.afrikaans) : getBaseName(birdObj.english);
    btn.onclick = () => check(option);
    optionsDiv.appendChild(btn);
  });
}

function check(answer) {
  if (!currentBird || answered) return;
  answered = true;

  const correct = answer === currentBird.english;
  gameTotalQuestions++;

  if (correct) {
    gameScore++;
    gameCorrectAnswers++;
    gameStreak++;
    if (gameStreak > gameLongestStreak) {
      gameLongestStreak = gameStreak;
      localStorage.setItem('birdGameLongestStreak', gameLongestStreak);
    }
    if (gameScore > gameHighScore) {
      gameHighScore = gameScore;
      localStorage.setItem('birdGameHighScore', gameHighScore);
    }
  } else {
    gameStreak = 0;
    wrongAnswers.push(currentBird);
  }

  updateScoreboard();

  const img = document.getElementById("birdImage");
  const copyrightOverlay = document.getElementById("copyrightOverlay");
  
  if (currentBird.image) {
    img.onerror = () => {
      img.style.display = "none";
      copyrightOverlay.style.display = "none";
    };
    img.onload = () => {
      img.style.display = "block";
      copyrightOverlay.style.display = "block";
      setTimeout(() => img.style.opacity = 1, 50);
    };
    img.src = currentBird.image;
    
    // Use photographer field for photo credit
    let copyrightText = "";
    if (currentBird.photographer) {
      // Use dedicated photographer field
      copyrightText = "© " + currentBird.photographer;
    } else if (currentBird.credit) {
      // Extract photographer name from credit field
      const creditMatch = currentBird.credit.match(/©\s*([^,]+)/);
      if (creditMatch) {
        copyrightText = creditMatch[0];
      }
    }
    copyrightOverlay.textContent = copyrightText;
  } else {
    copyrightOverlay.style.display = "none";
  }

  document.getElementById("info").innerHTML = `
    <div class="${correct ? "correct" : "wrong"}">
      ${correct ? "Correct" : "Wrong"}
    </div>
    <br>
    <b>English:</b> ${getBaseName(currentBird.english)}<br>
    <b>Afrikaans:</b> ${getBaseName(currentBird.afrikaans)}<br>
    <small>${currentBird.credit || ""}</small><br>
    <a href="${currentBird.licenseLink}" target="_blank">License</a>
  `;
}

function reviewMode() {
  if (wrongAnswers.length === 0) {
    alert("No mistakes yet");
    return;
  }

  filtered = [...wrongAnswers];
  queue = shuffle([...filtered]);
  document.getElementById("gameArea").style.display = "block";
  nextBird();
}


function updateScoreboard() {
  const el = document.getElementById('scoreboard');
  if (!el) return;
  const accuracy = gameTotalQuestions > 0 ? Math.round((gameCorrectAnswers / gameTotalQuestions) * 100) : 0;
  document.getElementById('statScore').textContent = gameScore;
  document.getElementById('statHighScore').textContent = gameHighScore;
  document.getElementById('statStreak').textContent = gameStreak;
  document.getElementById('statLongestStreak').textContent = gameLongestStreak;
  document.getElementById('statAccuracy').textContent = accuracy + '%';
}

// Initialize language from localStorage
(function() {
  const savedLang = localStorage.getItem('birdAppLanguage');
  if (savedLang) {
    document.getElementById('lang').value = savedLang;
  }
  document.getElementById('lang').addEventListener('change', function() {
    localStorage.setItem('birdAppLanguage', this.value);
  });
})();

// Initialize
loadCategory();
updateFilterOptions();
updateScoreboard();
