let allData = {
  waders,
  cisticolas,
  waterbirds,
  warblers
};

let birds = [];
let queue = [];
let current = null;
let wrong = [];

let audio = new Audio();

// ---------------- LOAD CATEGORY ----------------
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

  // spectrogram
  let img = document.getElementById("spectrogram");
  if(current.spectrogram){
    img.src = current.spectrogram;
    img.style.display = "block";
  } else {
    img.style.display = "none";
  }

  let lang = document.getElementById("lang").value;

  let correctName = lang === "af"
    ? current.afrikaans
    : current.english;

  let options = [correctName];

  let pool = birds.filter(b => b !== current);

  while(options.length < 4 && pool.length){
    let rBird = pool[Math.floor(Math.random()*pool.length)];

    let r = lang === "af"
      ? rBird.afrikaans
      : rBird.english;

    if(!options.includes(r)){
      options.push(r);
    }
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

  let lang = document.getElementById("lang").value;

  let correctName = lang === "af"
    ? current.afrikaans
    : current.english;

  let correct = ans === correctName;

  if(!correct){
    wrong.push(current);
  }

  document.getElementById("result").innerHTML = `
    <div class="${correct ? "correct" : "wrong"}">
      ${correct ? "Correct ✔" : "Wrong ✖"}
    </div>

    <br><b>English:</b> ${current.english}
    <br><b>Afrikaans:</b> ${current.afrikaans}
    <br><b>Habitat:</b> ${current.habitat}
    <br><b>Hotspot:</b> ${current.hotspot}
    <br><b>Level:</b> ${current.level || "-"}

    <br><br><b>Credit:</b> ${current.credit}
    <br><b>Changes:</b> ${current.changes}
    <br><b>License:</b> <a href="${current.licenseLink}" target="_blank">View</a>
  `;
}

// ---------------- REVIEW MODE ----------------
function reviewMode(){

  if(wrong.length === 0){
    alert("No mistakes yet!");
    return;
  }

  birds = [...wrong];
  queue = shuffle([...birds]);

  document.getElementById("game").style.display = "block";

  nextBird();
}
