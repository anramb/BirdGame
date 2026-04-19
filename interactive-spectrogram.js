// Interactive Spectrogram with Audio Visualization
class InteractiveSpectrogram {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.audio = null;
    this.spectrogramImage = null;
    this.isPlaying = false;
    this.currentTime = 0;
    this.duration = 0;
    this.progressBar = null;
    this.init();
  }

  init() {
    // Create canvas container
    const container = document.createElement('div');
    container.style.position = 'relative';
    container.style.width = '100%';
    container.style.marginTop = '8px';
    
    // Create canvas for spectrogram
    this.canvas = document.createElement('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.border = '1px solid #ccc';
    this.canvas.style.cursor = 'pointer';
    this.canvas.style.display = 'block';
    
    // Create progress bar
    this.progressBar = document.createElement('div');
    this.progressBar.style.position = 'absolute';
    this.progressBar.style.top = '0';
    this.progressBar.style.left = '0';
    this.progressBar.style.width = '2px';
    this.progressBar.style.height = '100%';
    this.progressBar.style.backgroundColor = 'red';
    this.progressBar.style.pointerEvents = 'none';
    this.progressBar.style.zIndex = '1000';
    this.progressBar.style.display = 'none';
    this.progressBar.style.border = '1px solid darkred';
    
    container.appendChild(this.canvas);
    container.appendChild(this.progressBar);
    
    // Add click handler for seeking
    this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
    
    return container;
  }

  loadSpectrogram(imageSrc, audioElement) {
    this.audio = audioElement;
    this.spectrogramImage = new Image();
    this.spectrogramImage.onload = () => {
      this.setupCanvas();
      this.drawSpectrogram();
    };
    this.spectrogramImage.src = imageSrc;
    
    // Setup audio event listeners
    this.audio.addEventListener('timeupdate', () => this.updateProgress());
    this.audio.addEventListener('loadedmetadata', () => this.updateDuration());
    this.audio.addEventListener('play', () => this.showProgress());
    this.audio.addEventListener('pause', () => this.hideProgress());
    this.audio.addEventListener('ended', () => this.hideProgress());
  }

  setupCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = this.spectrogramImage.height;
    this.ctx = this.canvas.getContext('2d');
  }

  drawSpectrogram() {
    if (!this.ctx || !this.spectrogramImage) return;
    
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(this.spectrogramImage, 0, 0, this.canvas.width, this.canvas.height);
  }

  updateProgress() {
    if (!this.audio || !this.duration) return;
    
    this.currentTime = this.audio.currentTime;
    const progress = this.currentTime / this.duration;
    const position = progress * this.canvas.width;
    
    this.progressBar.style.left = position + 'px';
  }

  updateDuration() {
    this.duration = this.audio.duration;
  }

  showProgress() {
    this.isPlaying = true;
    this.progressBar.style.display = 'block';
  }

  hideProgress() {
    this.isPlaying = false;
    this.progressBar.style.display = 'none';
  }

  handleCanvasClick(event) {
    if (!this.audio || !this.duration) return;
    
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const progress = x / rect.width;
    const newTime = progress * this.duration;
    
    this.audio.currentTime = newTime;
    this.updateProgress();
  }

  // Method to replace existing spectrogram
  replaceExistingSpectrogram() {
    const existingSpec = document.getElementById('spectrogram');
    if (existingSpec) {
      const container = existingSpec.parentNode;
      const newContainer = this.init();
      container.replaceChild(newContainer, existingSpec);
      newContainer.id = 'spectrogram';
      return true;
    }
    return false;
  }
}

// Global instance
let interactiveSpectrogram = null;

// Function to initialize interactive spectrogram
function initInteractiveSpectrogram(audioFile, spectrogramFile) {
  if (!interactiveSpectrogram) {
    interactiveSpectrogram = new InteractiveSpectrogram();
  }
  
  // Replace existing spectrogram
  if (interactiveSpectrogram.replaceExistingSpectrogram()) {
    interactiveSpectrogram.loadSpectrogram(spectrogramFile, audio);
  }
}
