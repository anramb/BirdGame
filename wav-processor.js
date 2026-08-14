// AudioWorklet processor — captures raw PCM samples from the microphone stream
// Runs on the audio rendering thread; sends Float32 chunks to the main thread via port
class WavRecorderProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this._active = false;
        this.port.onmessage = (e) => {
            if (e.data === 'start') this._active = true;
            if (e.data === 'stop')  this._active = false;
        };
    }

    process(inputs) {
        if (this._active && inputs[0] && inputs[0][0]) {
            // inputs[0][0] = first channel (mono) — slice() to avoid shared buffer issues
            this.port.postMessage(inputs[0][0].slice());
        }
        return true; // keep processor alive
    }
}

registerProcessor('wav-recorder', WavRecorderProcessor);
