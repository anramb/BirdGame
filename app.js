// Clean version - no infinite loops, no memory leaks
let allData = {
  cisticolas: typeof cisticolas !== 'undefined' ? cisticolas : [],
  gardenwoodland: typeof gardenwoodland !== 'undefined' ? gardenwoodland : [],
  groundbirds: typeof groundbirds !== 'undefined' ? groundbirds : [],
  LBJs: typeof LBJs !== 'undefined' ? LBJs : [],
  other: typeof other !== 'undefined' ? other : [],
  raptors: typeof raptors !== 'undefined' ? raptors : [],
  seedeaters: typeof seedeaters !== 'undefined' ? seedeaters : [],
  waders: typeof waders !== 'undefined' ? waders : [],
  warblers: typeof warblers !== 'undefined' ? warblers : [],
  waterbirds: typeof waterbirds !== 'undefined' ? waterbirds : []
};

let birds = [];
let filtered = [];
let queue = [];
let currentBird = null;
let wrongAnswers = [];
let audio = new Audio();
let started = false;

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

  const values = getUnique(type);
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

  const type = document.getElementById("filterType").value;
  const val = document.getElementById("filterValue").value;
  const lvl = document.getElementById("levelFilter").value;

  filtered = birds.filter(bird => {
    if (!bird) return false;
    const match1 = type === "none" || !val || (bird[type] || "").toLowerCase().includes(val.toLowerCase());
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

  // Use interactive spectrogram if available, otherwise fallback to regular
  if (currentBird?.spectrogram && typeof initInteractiveSpectrogram === 'function') {
    initInteractiveSpectrogram(currentBird.audio, currentBird.spectrogram);
  } else {
    // Fallback to regular spectrogram
    const spec = document.getElementById("spectrogram");
    if (currentBird?.spectrogram) {
      spec.src = currentBird.spectrogram;
      spec.style.display = "block";
    } else {
      spec.style.display = "none";
    }
  }

  const img = document.getElementById("birdImage");
  img.style.display = "none";
  img.style.opacity = 0;

  // Hide copyright overlay when starting new bird
  const copyrightOverlay = document.getElementById("copyrightOverlay");
  if (copyrightOverlay) {
    copyrightOverlay.style.display = "none";
  }

  createOptions();
  document.getElementById("info").innerHTML = "";
}

function createOptions() {
  if (!currentBird) return;

  const options = [currentBird.english];
  const pool = filtered.filter(b => b.english !== currentBird.english);

  while (options.length < 4 && pool.length > 0) {
    const randomIndex = Math.floor(Math.random() * pool.length);
    const randomBird = pool[randomIndex];
    if (!options.includes(randomBird.english)) {
      options.push(randomBird.english);
    }
    pool.splice(randomIndex, 1);
  }

  shuffle(options);

  const lang = document.getElementById("lang").value;
  const optionsDiv = document.getElementById("options");
  optionsDiv.innerHTML = "";

  options.forEach(option => {
    const birdObj = filtered.find(b => b.english === option);
    if (!birdObj) return;

    const btn = document.createElement("button");
    btn.textContent = lang === "af" ? birdObj.afrikaans : birdObj.english;
    btn.onclick = () => check(option);
    optionsDiv.appendChild(btn);
  });
}

function check(answer) {
  if (!currentBird) return;

  const correct = answer === currentBird.english;
  if (!correct) {
    wrongAnswers.push(currentBird);
  }

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
    <b>English:</b> ${currentBird.english}<br>
    <b>Afrikaans:</b> ${currentBird.afrikaans}<br>
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


// Initialize
loadCategory();
updateFilterOptions();

