// ===== SCROLLABLE SPECTROGRAM GENERATOR (Web Audio API + FFT) =====
// Shared by soundscape.html, single-select.html, and learn.html

// Reuse a single AudioContext to avoid browser limits (max ~6 concurrent contexts)
let _spectrogramAudioCtx = null;
let _spectrogramGenId = 0;

function getSpectrogramAudioCtx() {
    if (!_spectrogramAudioCtx || _spectrogramAudioCtx.state === 'closed') {
        _spectrogramAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_spectrogramAudioCtx.state === 'suspended') {
        _spectrogramAudioCtx.resume();
    }
    return _spectrogramAudioCtx;
}

// Simple FFT implementation (radix-2 Cooley-Tukey)
function spectrogramFFT(re, im) {
    const n = re.length;
    if (n <= 1) return;
    
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) { j ^= bit; }
        j ^= bit;
        if (i < j) {
            [re[i], re[j]] = [re[j], re[i]];
            [im[i], im[j]] = [im[j], im[i]];
        }
    }
    
    for (let len = 2; len <= n; len <<= 1) {
        const halfLen = len >> 1;
        const angle = -2 * Math.PI / len;
        const wRe = Math.cos(angle);
        const wIm = Math.sin(angle);
        
        for (let i = 0; i < n; i += len) {
            let curRe = 1, curIm = 0;
            for (let j = 0; j < halfLen; j++) {
                const tRe = curRe * re[i + j + halfLen] - curIm * im[i + j + halfLen];
                const tIm = curRe * im[i + j + halfLen] + curIm * re[i + j + halfLen];
                re[i + j + halfLen] = re[i + j] - tRe;
                im[i + j + halfLen] = im[i + j] - tIm;
                re[i + j] += tRe;
                im[i + j] += tIm;
                const newCurRe = curRe * wRe - curIm * wIm;
                curIm = curRe * wIm + curIm * wRe;
                curRe = newCurRe;
            }
        }
    }
}

// Greyscale: loud = dark, quiet = light (inverted)
function spectrogramColor(value) {
    const v = Math.max(0, Math.min(1, value));
    const grey = Math.floor((1 - v) * 255);
    return [grey, grey, grey];
}

// Load audio as ArrayBuffer (works with both HTTP and file://)
// Retries once with cache-busting if the first attempt fails or returns partial content
function loadAudioAsBuffer(audioSrc, _retryCount) {
    _retryCount = _retryCount || 0;
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        // On retry, add cache-buster to avoid stale range-request responses
        let url = audioSrc;
        if (_retryCount > 0) {
            url += (url.indexOf('?') === -1 ? '?' : '&') + '_t=' + Date.now();
        }
        xhr.open('GET', url, true);
        xhr.responseType = 'arraybuffer';
        xhr.timeout = 30000; // 30 second timeout
        // Prevent range requests that cause 206 responses
        xhr.setRequestHeader('Cache-Control', 'no-cache');
        xhr.onload = function() {
            // Accept any 2xx status or 0 (file://)
            if ((xhr.status >= 200 && xhr.status < 300) || xhr.status === 0) {
                if (xhr.response && xhr.response.byteLength > 0) {
                    resolve(xhr.response);
                } else {
                    reject(new Error('Empty response for: ' + audioSrc));
                }
            } else {
                reject(new Error('HTTP error ' + xhr.status + ': ' + audioSrc));
            }
        };
        xhr.onerror = function() {
            reject(new Error('Network error loading: ' + audioSrc));
        };
        xhr.ontimeout = function() {
            reject(new Error('Timeout loading: ' + audioSrc));
        };
        xhr.send();
    }).catch(function(err) {
        // Retry once with cache-busting
        if (_retryCount < 2) {
            console.warn('loadAudioAsBuffer retry ' + (_retryCount + 1) + ':', err.message);
            return loadAudioAsBuffer(audioSrc, _retryCount + 1);
        }
        throw err;
    });
}

// Create or update the frequency axis on the left of the spectrogram
function buildFrequencyAxis(outerContainer, scrollContainer, canvasHeight, maxFreqHz) {
    // Ensure outer container uses flex layout
    outerContainer.style.display = 'flex';
    outerContainer.style.flexDirection = 'row';
    outerContainer.style.flexWrap = 'wrap';
    outerContainer.style.alignItems = 'flex-start';
    
    // Remove existing freq axis if present
    const existing = outerContainer.querySelector('.spectrogram-freq-axis');
    if (existing) existing.remove();
    
    const axisDiv = document.createElement('div');
    axisDiv.className = 'spectrogram-freq-axis';
    axisDiv.style.position = 'relative';
    axisDiv.style.width = '38px';
    axisDiv.style.minWidth = '38px';
    axisDiv.style.height = canvasHeight + 'px';
    axisDiv.style.flexShrink = '0';
    axisDiv.style.borderRight = '1px solid #555';
    axisDiv.style.marginRight = '0px';
    axisDiv.style.boxSizing = 'border-box';
    
    // Frequency labels at 1kHz intervals (or 2kHz for small heights)
    const step = canvasHeight < 150 ? 2000 : 1000;
    for (let freq = 0; freq <= maxFreqHz; freq += step) {
        const label = document.createElement('span');
        label.style.position = 'absolute';
        label.style.right = '4px';
        label.style.fontSize = '9px';
        label.style.color = '#aaa';
        label.style.lineHeight = '1';
        label.style.whiteSpace = 'nowrap';
        
        // Position: 0 Hz at bottom, maxFreqHz at top
        const yFraction = freq / maxFreqHz;
        const yPos = canvasHeight - (yFraction * canvasHeight);
        label.style.top = yPos + 'px';
        label.style.transform = 'translateY(-50%)';
        
        // Format label
        if (freq >= 1000) {
            label.textContent = (freq / 1000) + 'k';
        } else {
            label.textContent = freq + '';
        }
        axisDiv.appendChild(label);
        
        // Add tick mark
        const tick = document.createElement('span');
        tick.style.position = 'absolute';
        tick.style.right = '0';
        tick.style.top = yPos + 'px';
        tick.style.width = '3px';
        tick.style.height = '1px';
        tick.style.background = '#555';
        axisDiv.appendChild(tick);
    }
    
    // Insert axis before the scroll container
    outerContainer.insertBefore(axisDiv, scrollContainer);
    
    // Ensure scroll container fills remaining space
    scrollContainer.style.flex = '1';
    scrollContainer.style.minWidth = '0';
    
    return axisDiv;
}

// Main: generate spectrogram and draw on canvas
// Options: { canvas, scrollContainer, line, timeAxis, outerContainer, pxPerSec, canvasHeight, audioElement }
async function generateScrollableSpectrogram(audioSrc, options) {
    const {
        canvas,
        scrollContainer,
        line,
        timeAxis,
        outerContainer,
        pxPerSec = 75,
        canvasHeight = 200,
        audioElement
    } = options;
    
    const ctx = canvas.getContext('2d');
    line.style.display = 'none';
    outerContainer.style.display = 'flex';
    
    // Show loading
    const existingLoading = scrollContainer.querySelector('.spectrogram-loading');
    if (!existingLoading) {
        scrollContainer.innerHTML = '';
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'spectrogram-loading';
        loadingDiv.textContent = 'Generating spectrogram...';
        scrollContainer.appendChild(loadingDiv);
        scrollContainer.appendChild(line);
    } else {
        existingLoading.textContent = 'Generating spectrogram...';
        existingLoading.style.color = '#aaa';
    }
    
    // Track generation ID so stale requests can be discarded on rapid skip/next
    const genId = ++_spectrogramGenId;
    
    try {
        const arrayBuffer = await loadAudioAsBuffer(audioSrc);
        
        // If a newer generation started while we were loading, abort this one
        if (genId !== _spectrogramGenId) {
            return { ready: false, totalWidth: 0 };
        }
        
        let audioCtx = getSpectrogramAudioCtx();
        // decodeAudioData detaches the buffer, so we must copy it for safety
        let audioBuffer;
        try {
            const bufferCopy = arrayBuffer.slice(0);
            audioBuffer = await audioCtx.decodeAudioData(bufferCopy);
        } catch (decodeErr) {
            // AudioContext may be in a bad state — force-recreate and retry once
            console.warn('decodeAudioData failed, recreating AudioContext:', decodeErr);
            try { _spectrogramAudioCtx.close(); } catch(e) {}
            _spectrogramAudioCtx = null;
            audioCtx = getSpectrogramAudioCtx();
            const bufferCopy2 = arrayBuffer.slice(0);
            audioBuffer = await audioCtx.decodeAudioData(bufferCopy2);
        }
        
        // Check again after decode
        if (genId !== _spectrogramGenId) {
            return { ready: false, totalWidth: 0 };
        }
        
        const samples = audioBuffer.getChannelData(0);
        const sampleRate = audioBuffer.sampleRate;
        const duration = audioBuffer.duration;
        
        const fftSize = 2048;
        const hopSize = Math.floor(sampleRate / pxPerSec);
        const numColumns = Math.floor((samples.length - fftSize) / hopSize) + 1;
        const freqBins = fftSize / 2;
        
        // Show up to ~10kHz
        const maxFreqHz = 10000;
        const maxBin = Math.min(freqBins, Math.floor(maxFreqHz / (sampleRate / fftSize)));
        
        // Build frequency axis
        buildFrequencyAxis(outerContainer, scrollContainer, canvasHeight, maxFreqHz);
        
        const totalWidth = numColumns;
        
        // Setup canvas
        scrollContainer.innerHTML = '';
        scrollContainer.appendChild(canvas);
        scrollContainer.appendChild(line);
        
        canvas.width = totalWidth;
        canvas.height = canvasHeight;
        canvas.style.width = totalWidth + 'px';
        canvas.style.height = canvasHeight + 'px';
        
        const imageData = ctx.createImageData(totalWidth, canvasHeight);
        const pixels = imageData.data;
        
        // Hann window
        const hannWindow = new Float32Array(fftSize);
        for (let i = 0; i < fftSize; i++) {
            hannWindow[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSize - 1)));
        }
        
        const re = new Float64Array(fftSize);
        const im = new Float64Array(fftSize);
        const allMags = new Float32Array(numColumns * maxBin);
        let globalMax = 0;
        
        // First pass: compute magnitudes
        for (let col = 0; col < numColumns; col++) {
            const offset = col * hopSize;
            for (let i = 0; i < fftSize; i++) {
                re[i] = (offset + i < samples.length) ? samples[offset + i] * hannWindow[i] : 0;
                im[i] = 0;
            }
            spectrogramFFT(re, im);
            for (let bin = 0; bin < maxBin; bin++) {
                const mag = Math.sqrt(re[bin] * re[bin] + im[bin] * im[bin]);
                const logMag = Math.log10(1 + mag * 100);
                allMags[col * maxBin + bin] = logMag;
                if (logMag > globalMax) globalMax = logMag;
            }
        }
        
        // Second pass: draw pixels
        for (let col = 0; col < numColumns; col++) {
            for (let bin = 0; bin < maxBin; bin++) {
                const normalized = globalMax > 0 ? allMags[col * maxBin + bin] / globalMax : 0;
                const boosted = Math.pow(normalized, 0.6);
                const [r, g, b] = spectrogramColor(boosted);
                
                const y = canvasHeight - 1 - Math.floor((bin / maxBin) * canvasHeight);
                const idx = (y * totalWidth + col) * 4;
                pixels[idx] = r;
                pixels[idx + 1] = g;
                pixels[idx + 2] = b;
                pixels[idx + 3] = 255;
            }
        }
        
        ctx.putImageData(imageData, 0, 0);
        
        // Time axis
        if (timeAxis) {
            timeAxis.innerHTML = '';
            timeAxis.style.width = '100%';
            timeAxis.style.flexBasis = '100%';
            timeAxis.style.position = 'relative';
            timeAxis.style.marginLeft = '38px';
            const interval = 5;
            for (let t = 0; t <= duration; t += interval) {
                const x = (t / duration) * totalWidth;
                const marker = document.createElement('span');
                marker.style.position = 'absolute';
                marker.style.left = x + 'px';
                marker.style.top = '2px';
                const mins = Math.floor(t / 60);
                const secs = Math.floor(t % 60);
                marker.textContent = mins + ':' + String(secs).padStart(2, '0');
                timeAxis.appendChild(marker);
            }
        }
        
        // Return info for event handlers
        return { ready: true, totalWidth: totalWidth };
        
    } catch (err) {
        console.error('Spectrogram generation failed:', err);
        scrollContainer.innerHTML = '';
        const errorDiv = document.createElement('div');
        errorDiv.className = 'spectrogram-loading';
        errorDiv.style.color = '#ff6b6b';
        errorDiv.innerHTML = 'Spectrogram could not load.<br><small>' + err.message + '</small>';
        scrollContainer.appendChild(errorDiv);
        scrollContainer.appendChild(line);
        return { ready: false, totalWidth: 0 };
    }
}

// Helper: update red line position and auto-scroll
function updateSpectrogramLine(audioElement, line, scrollContainer, totalWidth, spectrogramReady) {
    if (!audioElement.duration || !spectrogramReady || totalWidth === 0) return;
    
    const progress = audioElement.currentTime / audioElement.duration;
    const xPos = progress * totalWidth;
    
    line.style.left = xPos + 'px';
    line.style.display = 'block';
    
    // Auto-scroll to keep line visible
    const containerWidth = scrollContainer.clientWidth;
    const scrollLeft = scrollContainer.scrollLeft;
    const targetScroll = xPos - containerWidth * 0.3;
    if (xPos < scrollLeft || xPos > scrollLeft + containerWidth - 20) {
        scrollContainer.scrollLeft = Math.max(0, targetScroll);
    }
}

// Helper: click on spectrogram to seek
function setupSpectrogramClick(scrollContainer, canvas, audioElement, getTotalWidth, getReady) {
    scrollContainer.addEventListener('click', function(e) {
        if (!audioElement.duration || !getReady()) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const tw = getTotalWidth();
        if (tw <= 0) return;
        const progress = x / tw;
        audioElement.currentTime = Math.max(0, Math.min(audioElement.duration, progress * audioElement.duration));
    });
}
