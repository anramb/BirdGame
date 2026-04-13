let birds = [];
let queue = [];
let current = null;
let audio = new Audio();
let wrong = [];

// LOAD DATA FILES
function loadBirdData(){
  if(window.birds_waders) birds = birds.concat(window.birds_waders);
  if(window.birds_waterbirds) birds = birds.concat(window.birds_waterbirds);
  if(window.birds_cisticolas) birds = birds.concat(window.birds_cisticolas);
  if(window.birds_warblers) birds = birds.concat(window.birds_warblers);
}

loadBirdData();

// AUDIO
function playAudio(file){
  audio.pause();
  audio.src = file;
  audio.load();
  audio.play().catch(()=>{});
}

function togglePlay(){
  audio.paused ? audio.play() : audio.pause();
}

// SHUFFLE
function shuffle(arr){
  return arr.sort(()=>Math.random()-0.5);
}

// START GAME
function startGame(){

  wrong = [];

  let cat = document.getElementById("category").value;

  let filtered = (cat)
    ? birds.filter(b => b.category === cat)
    : [...birds];

  queue = shuffle(filtered);

  document.getElementById("gameArea").style.display = "block";

  nextBird();
}

// NEXT BIRD (NO REPEATS)
function nextBird(){

  if(queue.length === 0){
    alert("Finished!");
    return;
  }

  current = queue.shift();

  playAudio(current.audio);

  document.getElementById("spectrogram").src = current.spectrogram;

  let options = [current];

  let pool = birds.filter(b => b !== current);

  while(options.length < 4 && pool.length){
    options.push(pool.pop());
  }

  shuffle(options);

  let div = document.getElementById("options");
  div.innerHTML = "";

  options.forEach(b=>{
    let btn = document.createElement("button");
    btn.textContent = b.english;
    btn.onclick = ()=>check(b);
    div.appendChild(btn);
  });

  document.getElementById("info").innerHTML = "";
}

// CHECK ANSWER
function check(bird){

  let correct = bird.english === current.english;

  if(!correct) wrong.push(current);

  document.getElementById("info").innerHTML = `
    <div style="color:${correct ? 'green':'red'};font-weight:bold;">
      ${correct ? "Correct ✔" : "Wrong ✖"}
    </div>

    <b>${current.english}</b> / ${current.afrikaans}<br>

    <img src="${current.image || ''}" style="width:100%;margin-top:10px;">
  `;
}