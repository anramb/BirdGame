let allData = {
  waders,
  waterbirds,
  cisticolas,
  warblers
};

let birds = [];
let filtered = [];
let queue = [];
let currentBird = null;
let wrongAnswers = [];

let audio = new Audio();
let started = false;

// ---------------- LOAD CATEGORY ----------------
function loadCategory(){
  let cat = document.getElementById("category").value;
  birds = allData[cat] || [];
  updateFilterOptions();
}

loadCategory();

// ---------------- AUDIO ----------------
function playAudio(file){
  audio.pause();
  audio.src = file;
  audio.load();
  audio.play().catch(()=>{});
}

function startOrPlay(){
  if(!started){
    startGame();
    started = true;
  } else {
    audio.paused ? audio.play() : audio.pause();
  }
}

// ---------------- FILTER HELPERS ----------------
function getUnique(key){
  let arr = [];

  birds.forEach(b=>{
    (String(b[key] || "")).split(";").forEach(v=>{
      v = v.trim();
      if(v && !arr.includes(v)) arr.push(v);
    });
  });

  return arr;
}

function updateFilterOptions(){
  let type = document.getElementById("filterType").value;
  let sel = document.getElementById("filterValue");

  sel.innerHTML = "";

  if(type === "none"){
    sel.innerHTML = "<option value=''>All</option>";
    return;
  }

  getUnique(type).forEach(v=>{
    let o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    sel.appendChild(o);
  });
}

// ---------------- SHUFFLE ----------------
function shuffle(arr){
  return arr.sort(()=>Math.random()-0.5);
}

// ---------------- START GAME ----------------
function startGame(){

  wrongAnswers = [];

  let type = document.getElementById("filterType").value;
  let val = document.getElementById("filterValue").value;
  let lvl = document.getElementById("levelFilter").value;

  filtered = birds.filter(b=>{
    let match1 =
      (type === "none" || !val ||
      (String(b[type] || "").toLowerCase().includes(val.toLowerCase())));

    let match2 =
      (!lvl || (b.level || "").startsWith(lvl));

    return match1 && match2;
  });

  queue = shuffle([...filtered]);

  document.getElementById("gameArea").style.display = "block";

  nextBird();
}

// ---------------- NEXT BIRD ----------------
function nextBird(){

  if(queue.length === 0){
    queue = shuffle([...filtered]);
  }

  currentBird = queue.shift();

  playAudio(currentBird.audio);

  let img = document.getElementById("spectrogram");
  if(currentBird.spectrogram){
    img.src = currentBird.spectrogram;
    img.style.display = "block";
  } else {
    img.style.display = "none";
  }

  let options = [currentBird.english];

  let pool = filtered.filter(b => b.english !== currentBird.english);

  while(options.length < 4 && pool.length){
    let r = pool[Math.floor(Math.random()*pool.length)].english;
    if(!options.includes(r)) options.push(r);
  }

  shuffle(options);

  let div = document.getElementById("options");
  div.innerHTML = "";

  options.forEach(o=>{
    let btn = document.createElement("button");
    btn.textContent = o;
    btn.onclick = ()=>check(o);
    div.appendChild(btn);
  });

  document.getElementById("info").innerHTML = "";
}

// ---------------- CHECK ANSWER ----------------
function check(ans){

  let correct = ans === currentBird.english;

  if(!correct){
    wrongAnswers.push(currentBird);
  }

  document.getElementById("info").innerHTML = `
    <b style="color:${correct ? 'green' : 'red'}">
      ${correct ? "✔ Correct" : "✖ Wrong"}
    </b><br><br>

    <b>English:</b> ${currentBird.english}<br>
    <b>Afrikaans:</b> ${currentBird.afrikaans}<br>
    <b>Habitat:</b> ${currentBird.habitat || "-"}<br>
    <b>Hotspot:</b> ${currentBird.hotspot || "-"}<br><br>

    <small>${currentBird.credit}</small><br>

    <a href="${currentBird.licenseLink}" target="_blank">License</a>
  `;
}

// ---------------- REVIEW ----------------
function reviewMode(){

  if(wrongAnswers.length === 0){
    alert("No mistakes yet");
    return;
  }

  filtered = [...wrongAnswers];
  queue = shuffle([...filtered]);

  document.getElementById("gameArea").style.display = "block";

  nextBird();
}
