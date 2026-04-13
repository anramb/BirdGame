let allData = {
  waders,
  cisticolas,
  waterbirds,
  raptors
};

let birds = [];
let queue = [];
let current = null;
let wrong = [];
let audio = new Audio();

function loadCategory(){
  let cat = document.getElementById("category").value;
  birds = allData[cat] || [];
  queue = [];
}

loadCategory();

// ---------------- AUDIO ----------------
function playAudio(file){
  audio.pause();
  audio.src = file;
  audio.load();
  audio.play().catch(()=>{});
}

function togglePlay(){
  audio.paused ? audio.play() : audio.pause();
}

// ---------------- SHUFFLE ----------------
function shuffle(arr){
  return arr.sort(()=>Math.random()-0.5);
}

// ---------------- START ----------------
function startGame(){

  wrong = [];

  let level = document.getElementById("level").value;

  let filtered = birds.filter(b =>
    level === "all" || b.level === level
  );

  queue = shuffle([...filtered]);

  document.getElementById("game").style.display = "block";

  nextBird();
}

// ---------------- NEXT ----------------
function nextBird(){

  if(queue.length === 0){
    let level = document.getElementById("level").value;

    let filtered = birds.filter(b =>
      level === "all" || b.level === level
    );

    queue = shuffle([...filtered]);
  }

  current = queue.shift();

  playAudio(current.audio);

  document.getElementById("spectrogram").src = current.spectrogram || "";
  document.getElementById("spectrogram").style.display =
    current.spectrogram ? "block" : "none";

  let options = [current.english];

  let pool = birds.filter(b => b.english !== current.english);

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

  document.getElementById("result").innerHTML = "";
}

// ---------------- CHECK ----------------
function check(ans){

  let correct = ans === current.english;

  if(!correct) wrong.push(current);

  document.getElementById("result").innerHTML =
    correct
    ? `<div class="correct">Correct ✔</div>`
    : `<div class="wrong">Wrong ✖</div>`;
}
