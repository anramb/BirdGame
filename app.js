let allData = {
  cisticolas,
  waders,
  warblers,
  waterbirds
  
  
};

let birds = [];
let filtered = [];
let queue = [];
let currentBird = null;
let wrongAnswers = [];

let audio = new Audio();
let started = false;

// -------- LOAD CATEGORY --------
function loadCategory(){
  let cat = document.getElementById("category").value;
  birds = allData[cat] || [];
  updateFilterOptions();
}

loadCategory();

// -------- AUDIO --------
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

// -------- FILTER --------
function getUnique(key){
  let arr=[];
  birds.forEach(b=>{
    (b[key] || "").split(";").forEach(v=>{
      v=v.trim();
      if(v && !arr.includes(v)) arr.push(v);
    });
  });
  return arr;
}

function updateFilterOptions(){
  let type=document.getElementById("filterType").value;
  let sel=document.getElementById("filterValue");

  sel.innerHTML="";

  if(type==="none"){
    let o=document.createElement("option");
    o.value="";
    o.textContent="All";
    sel.appendChild(o);
    return;
  }

  getUnique(type).forEach(v=>{
    let o=document.createElement("option");
    o.value=v;
    o.textContent=v;
    sel.appendChild(o);
  });
}

// -------- SHUFFLE --------
function shuffle(arr){
  return arr.sort(()=>Math.random()-0.5);
}

// -------- START --------
function startGame(){

  wrongAnswers = [];

  let type=document.getElementById("filterType").value;
  let val=document.getElementById("filterValue").value;
  let lvl=document.getElementById("levelFilter").value;

  filtered = birds.filter(b=>{
    let match1 = (type==="none" || !val || (b[type] || "").toLowerCase().includes(val.toLowerCase()));
    let match2 = (!lvl || (b.level || "").startsWith(lvl));
    return match1 && match2;
  });

  queue = shuffle([...filtered]);

  document.getElementById("gameArea").style.display="block";

  nextBird();
}

// -------- NEXT --------
function nextBird(){

  if(queue.length === 0){
    queue = shuffle([...filtered]);
  }

  currentBird = queue.shift();

  playAudio(currentBird.audio);

  // Spectrogram
  let spec=document.getElementById("spectrogram");
  if(currentBird.spectrogram){
    spec.src = currentBird.spectrogram;
    spec.style.display="block";
  } else {
    spec.style.display="none";
  }

  // HIDE IMAGE
  let img=document.getElementById("birdImage");
  img.style.display="none";
  img.style.opacity = 0;

  // OPTIONS
  let options=[currentBird.english];
  let pool = filtered.filter(b => b.english !== currentBird.english);

  while(options.length<4 && pool.length>0){
    let r = pool[Math.floor(Math.random()*pool.length)].english;
    if(!options.includes(r)) options.push(r);
  }

  shuffle(options);

  let div=document.getElementById("options");
  div.innerHTML="";

  let lang=document.getElementById("lang").value;

  options.forEach(o=>{
    let birdObj = filtered.find(b=>b.english===o);

    let btn=document.createElement("button");
    btn.textContent = lang==="af" ? birdObj.afrikaans : birdObj.english;

    btn.onclick=()=>check(o);

    div.appendChild(btn);
  });

  document.getElementById("info").innerHTML="";
}

// -------- CHECK --------
function check(ans){

  let correct = ans === currentBird.english;

  if(!correct){
    wrongAnswers.push(currentBird);
  }

  let lang=document.getElementById("lang").value;

  let img=document.getElementById("birdImage");

  if(currentBird.image){
    img.src = currentBird.image;
    img.style.display="block";

    // fade-in
    setTimeout(()=>{
      img.style.opacity = 1;
    },50);
  }

  document.getElementById("info").innerHTML = `
    <div class="${correct ? "correct" : "wrong"}">
      ${correct ? "✔ Correct" : "✖ Wrong"}
    </div>
    <b>English:</b> ${currentBird.english}<br>
    <b>Afrikaans:</b> ${currentBird.afrikaans}<br>
    <small>${currentBird.credit || ""}</small><br>
    <a href="${currentBird.licenseLink}" target="_blank">License</a>        
  `;
}

// -------- REVIEW --------
function reviewMode(){

  if(wrongAnswers.length === 0){
    alert("No mistakes yet");
    return;
  }

  filtered = [...wrongAnswers];
  queue = shuffle([...filtered]);

  document.getElementById("gameArea").style.display="block";

  nextBird();
}

// INIT
updateFilterOptions();
