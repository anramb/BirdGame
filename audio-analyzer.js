/**
 * Bird Sound Audio Analyzer
 * =========================
 * Browser-based audio feature extraction and comparison engine.
 * Uses Web Audio API for analysis.
 * Compares user recordings against preprocessed bird audio features.
 */

class BirdAudioAnalyzer {
    constructor() {
        this.audioContext = null;
        this.featuresDB = null;       // Preprocessed bird features
        this.isLoaded = false;
        this.SR = 22050;              // Target sample rate for analysis
        this.N_FFT = 2048;
        this.HOP_LENGTH = 512;
        this.N_MFCC = 13;
        this.FREQ_MIN = 200;
        this.FREQ_MAX = 12000;
    }

    // ==========================================
    // INITIALIZATION
    // ==========================================

    async init() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: this.SR });
        await this.loadFeaturesDB();
    }

    async loadFeaturesDB() {
        try {
            const response = await fetch('bird_audio_features.json');
            this.featuresDB = await response.json();
            this.isLoaded = true;
            console.log(`Loaded features for ${this.featuresDB.totalProcessed} bird recordings`);
        } catch (e) {
            console.error('Failed to load bird audio features:', e);
            // Try compact version
            try {
                const response = await fetch('bird_audio_features_compact.json');
                this.featuresDB = await response.json();
                this.isLoaded = true;
                console.log(`Loaded compact features for ${this.featuresDB.totalProcessed} bird recordings`);
            } catch (e2) {
                console.error('Failed to load compact features:', e2);
                this.isLoaded = false;
            }
        }
    }

    // ==========================================
    // AUDIO LOADING & PREPROCESSING
    // ==========================================

    async loadAudio(source) {
        // source can be: File, Blob, ArrayBuffer, or URL string
        let arrayBuffer;

        if (source instanceof File || source instanceof Blob) {
            arrayBuffer = await source.arrayBuffer();
        } else if (source instanceof ArrayBuffer) {
            arrayBuffer = source;
        } else if (typeof source === 'string') {
            const response = await fetch(source);
            arrayBuffer = await response.arrayBuffer();
        } else {
            throw new Error('Unsupported audio source type');
        }

        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        // Convert to mono
        const channelData = audioBuffer.getChannelData(0);

        // Resample to target SR if needed
        let samples;
        if (audioBuffer.sampleRate !== this.SR) {
            samples = this._resample(channelData, audioBuffer.sampleRate, this.SR);
        } else {
            samples = new Float32Array(channelData);
        }

        return { samples, sampleRate: this.SR, duration: samples.length / this.SR };
    }

    _resample(data, fromRate, toRate) {
        const ratio = fromRate / toRate;
        const newLength = Math.round(data.length / ratio);
        const result = new Float32Array(newLength);
        for (let i = 0; i < newLength; i++) {
            const srcIdx = i * ratio;
            const low = Math.floor(srcIdx);
            const high = Math.min(low + 1, data.length - 1);
            const frac = srcIdx - low;
            result[i] = data[low] * (1 - frac) + data[high] * frac;
        }
        return result;
    }

    // ==========================================
    // STEP 1: QUALITY ASSESSMENT
    // ==========================================

    assessQuality(samples, sampleRate) {
        const duration = samples.length / sampleRate;
        const result = {
            duration: Math.round(duration * 10) / 10,
            rating: 'good',        // good, fair, poor
            warnings: [],
            details: {}
        };

        // Check duration
        if (duration < 2) {
            result.warnings.push('Recording is very short (< 2s). Try recording for 10-15 seconds.');
            result.rating = 'poor';
        } else if (duration < 5) {
            result.warnings.push('Recording is short. Longer recordings (10-15s) give better results.');
            if (result.rating === 'good') result.rating = 'fair';
        } else if (duration > 60) {
            result.warnings.push('Recording is long. Only the first 30 seconds will be analyzed.');
        }

        // Signal strength (RMS)
        const rms = this._computeRMS(samples);
        result.details.rms = rms;
        if (rms < 0.005) {
            result.warnings.push('Signal is very weak. Try recording closer to the bird.');
            result.rating = 'poor';
        } else if (rms < 0.02) {
            result.warnings.push('Signal is somewhat weak. A stronger recording may improve results.');
            if (result.rating === 'good') result.rating = 'fair';
        }

        // Noise estimation (ratio of low-frequency energy to total energy)
        const noiseRatio = this._estimateNoise(samples, sampleRate);
        result.details.noiseRatio = noiseRatio;
        if (noiseRatio > 0.7) {
            result.warnings.push('High background noise detected. Try a quieter location.');
            if (result.rating !== 'poor') result.rating = 'fair';
        }

        // Vocalization detection (check for distinct peaks in bird frequency range)
        const hasVocalization = this._detectVocalization(samples, sampleRate);
        result.details.hasVocalization = hasVocalization;
        if (!hasVocalization) {
            result.warnings.push('No clear bird vocalization detected. Make sure a bird is singing.');
            result.rating = 'poor';
        }

        // Clipping detection
        const clippingRatio = this._detectClipping(samples);
        result.details.clippingRatio = clippingRatio;
        if (clippingRatio > 0.01) {
            result.warnings.push('Audio clipping detected. Try moving further from the sound source.');
            if (result.rating === 'good') result.rating = 'fair';
        }

        if (result.warnings.length === 0) {
            result.warnings.push('Recording quality looks good!');
        }

        return result;
    }

    _computeRMS(samples) {
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
            sum += samples[i] * samples[i];
        }
        return Math.sqrt(sum / samples.length);
    }

    _estimateNoise(samples, sampleRate) {
        // Compare energy below 200Hz (typically noise/wind) vs total energy
        const fftSize = this.N_FFT;
        const numFrames = Math.floor((samples.length - fftSize) / this.HOP_LENGTH);
        if (numFrames <= 0) return 0;

        let lowEnergy = 0;
        let totalEnergy = 0;
        const freqBinLow = Math.floor(200 * fftSize / sampleRate);

        // Analyze just a few frames for speed
        const framesToCheck = Math.min(numFrames, 20);
        const step = Math.max(1, Math.floor(numFrames / framesToCheck));

        for (let f = 0; f < numFrames; f += step) {
            const start = f * this.HOP_LENGTH;
            const frame = samples.slice(start, start + fftSize);
            const spectrum = this._fft(frame);

            for (let i = 0; i < spectrum.length; i++) {
                const energy = spectrum[i] * spectrum[i];
                totalEnergy += energy;
                if (i < freqBinLow) {
                    lowEnergy += energy;
                }
            }
        }

        return totalEnergy > 0 ? lowEnergy / totalEnergy : 0;
    }

    _detectVocalization(samples, sampleRate) {
        // Check for energy peaks in the 500-10000Hz range (typical bird vocalization)
        const fftSize = this.N_FFT;
        const numFrames = Math.floor((samples.length - fftSize) / this.HOP_LENGTH);
        if (numFrames <= 0) return false;

        const binLow = Math.floor(500 * fftSize / sampleRate);
        const binHigh = Math.floor(10000 * fftSize / sampleRate);

        let maxBirdEnergy = 0;
        let meanBirdEnergy = 0;
        let frameCount = 0;

        const framesToCheck = Math.min(numFrames, 30);
        const step = Math.max(1, Math.floor(numFrames / framesToCheck));

        for (let f = 0; f < numFrames; f += step) {
            const start = f * this.HOP_LENGTH;
            const frame = samples.slice(start, start + fftSize);
            const spectrum = this._fft(frame);

            let birdEnergy = 0;
            for (let i = binLow; i < Math.min(binHigh, spectrum.length); i++) {
                birdEnergy += spectrum[i] * spectrum[i];
            }
            meanBirdEnergy += birdEnergy;
            maxBirdEnergy = Math.max(maxBirdEnergy, birdEnergy);
            frameCount++;
        }

        meanBirdEnergy /= frameCount;
        // Vocalization present if peak is significantly above mean (dynamic contrast)
        return maxBirdEnergy > meanBirdEnergy * 2.5;
    }

    _detectClipping(samples) {
        let clipped = 0;
        for (let i = 0; i < samples.length; i++) {
            if (Math.abs(samples[i]) > 0.99) clipped++;
        }
        return clipped / samples.length;
    }

    // ==========================================
    // FEATURE EXTRACTION (Browser-side)
    // ==========================================

    extractFeatures(samples, sampleRate) {
        const duration = samples.length / sampleRate;

        // Trim to max 30 seconds for analysis
        const maxSamples = sampleRate * 30;
        if (samples.length > maxSamples) {
            samples = samples.slice(0, maxSamples);
        }

        // --- Spectral features via FFT ---
        const fftSize = this.N_FFT;
        const hopLength = this.HOP_LENGTH;
        const numFrames = Math.floor((samples.length - fftSize) / hopLength);
        const numBins = fftSize / 2 + 1;

        // Frequency axis
        const freqs = new Float32Array(numBins);
        for (let i = 0; i < numBins; i++) {
            freqs[i] = i * sampleRate / fftSize;
        }

        // Compute spectrogram
        const spectrogram = [];
        for (let f = 0; f < numFrames; f++) {
            const start = f * hopLength;
            const frame = samples.slice(start, start + fftSize);
            const spectrum = this._fft(frame);
            spectrogram.push(spectrum);
        }

        // Mean spectrum
        const meanSpectrum = new Float32Array(numBins);
        for (let f = 0; f < numFrames; f++) {
            for (let i = 0; i < numBins; i++) {
                meanSpectrum[i] += spectrogram[f][i];
            }
        }
        for (let i = 0; i < numBins; i++) {
            meanSpectrum[i] /= numFrames;
        }

        // Bird frequency range mask
        const birdBinLow = Math.floor(this.FREQ_MIN * fftSize / sampleRate);
        const birdBinHigh = Math.floor(this.FREQ_MAX * fftSize / sampleRate);

        // Dominant frequency
        let maxEnergy = 0;
        let dominantBin = birdBinLow;
        for (let i = birdBinLow; i <= birdBinHigh && i < numBins; i++) {
            if (meanSpectrum[i] > maxEnergy) {
                maxEnergy = meanSpectrum[i];
                dominantBin = i;
            }
        }
        const dominantFreq = dominantBin * sampleRate / fftSize;

        // Frequency range (where energy > 10% of max)
        const threshold = maxEnergy * 0.1;
        let freqLow = dominantFreq;
        let freqHigh = dominantFreq;
        for (let i = birdBinLow; i <= birdBinHigh && i < numBins; i++) {
            if (meanSpectrum[i] > threshold) {
                const f = i * sampleRate / fftSize;
                if (f < freqLow) freqLow = f;
                if (f > freqHigh) freqHigh = f;
            }
        }

        // Spectral centroid
        let centroidNum = 0, centroidDen = 0;
        for (let i = 0; i < numBins; i++) {
            centroidNum += freqs[i] * meanSpectrum[i];
            centroidDen += meanSpectrum[i];
        }
        const spectralCentroid = centroidDen > 0 ? centroidNum / centroidDen : 0;

        // Spectral bandwidth
        let bwNum = 0;
        for (let i = 0; i < numBins; i++) {
            bwNum += meanSpectrum[i] * (freqs[i] - spectralCentroid) * (freqs[i] - spectralCentroid);
        }
        const spectralBandwidth = centroidDen > 0 ? Math.sqrt(bwNum / centroidDen) : 0;

        // Spectral rolloff (frequency below which 85% of energy lies)
        const totalEnergy = centroidDen;
        let cumEnergy = 0;
        let spectralRolloff = freqs[numBins - 1];
        for (let i = 0; i < numBins; i++) {
            cumEnergy += meanSpectrum[i];
            if (cumEnergy >= totalEnergy * 0.85) {
                spectralRolloff = freqs[i];
                break;
            }
        }

        // --- RMS & ZCR ---
        const rmsValues = [];
        for (let f = 0; f < numFrames; f++) {
            const start = f * hopLength;
            let sum = 0;
            for (let i = start; i < start + fftSize && i < samples.length; i++) {
                sum += samples[i] * samples[i];
            }
            rmsValues.push(Math.sqrt(sum / fftSize));
        }
        const meanRMS = rmsValues.reduce((a, b) => a + b, 0) / rmsValues.length;

        let zcCount = 0;
        for (let i = 1; i < samples.length; i++) {
            if ((samples[i] >= 0 && samples[i - 1] < 0) || (samples[i] < 0 && samples[i - 1] >= 0)) {
                zcCount++;
            }
        }
        const zcr = zcCount / samples.length;

        // --- Onset detection ---
        const onsetStrength = [];
        for (let f = 1; f < numFrames; f++) {
            let diff = 0;
            for (let i = birdBinLow; i <= birdBinHigh && i < numBins; i++) {
                const d = spectrogram[f][i] - spectrogram[f - 1][i];
                if (d > 0) diff += d;
            }
            onsetStrength.push(diff);
        }

        // Find onset peaks
        const onsetThreshold = this._mean(onsetStrength) + this._std(onsetStrength) * 1.5;
        const onsets = [];
        const minOnsetGap = Math.floor(0.05 * sampleRate / hopLength); // Min 50ms between onsets
        let lastOnset = -minOnsetGap;

        for (let i = 1; i < onsetStrength.length - 1; i++) {
            if (onsetStrength[i] > onsetThreshold &&
                onsetStrength[i] > onsetStrength[i - 1] &&
                onsetStrength[i] > onsetStrength[i + 1] &&
                (i - lastOnset) >= minOnsetGap) {
                onsets.push(i * hopLength / sampleRate);
                lastOnset = i;
            }
        }

        const numOnsets = onsets.length;
        let meanOnsetInterval = 0, onsetRegularity = 0, repetitionRate = 0;
        if (numOnsets >= 2) {
            const intervals = [];
            for (let i = 1; i < onsets.length; i++) {
                intervals.push(onsets[i] - onsets[i - 1]);
            }
            meanOnsetInterval = this._mean(intervals);
            onsetRegularity = 1.0 / (1.0 + this._std(intervals));
            repetitionRate = numOnsets / duration;
        }

        // Tempo estimation (from onset autocorrelation)
        const tempo = this._estimateTempo(onsetStrength, sampleRate);

        // --- MFCC (simplified browser implementation) ---
        const mfccs = this._computeMFCC(spectrogram, sampleRate, numBins);

        // --- Band energies ---
        const nBands = 8;
        const bandEdges = [];
        for (let i = 0; i <= nBands; i++) {
            bandEdges.push(this.FREQ_MIN + (this.FREQ_MAX - this.FREQ_MIN) * i / nBands);
        }
        const bandEnergies = [];
        for (let i = 0; i < nBands; i++) {
            const bLow = Math.floor(bandEdges[i] * fftSize / sampleRate);
            const bHigh = Math.floor(bandEdges[i + 1] * fftSize / sampleRate);
            let energy = 0;
            let count = 0;
            for (let j = bLow; j < bHigh && j < numBins; j++) {
                energy += meanSpectrum[j];
                count++;
            }
            bandEnergies.push(count > 0 ? energy / count : 0);
        }
        const bandTotal = bandEnergies.reduce((a, b) => a + b, 0);
        const normBandEnergies = bandTotal > 0 ? bandEnergies.map(e => e / bandTotal) : bandEnergies;

        // --- Spectral envelope (32 points) ---
        const envLength = 32;
        const birdSpectrum = [];
        for (let i = birdBinLow; i <= birdBinHigh && i < numBins; i++) {
            birdSpectrum.push(meanSpectrum[i]);
        }
        const spectralEnvelope = this._resampleArray(birdSpectrum, envLength);
        const envMax = Math.max(...spectralEnvelope, 0.0001);
        const normSpectralEnvelope = spectralEnvelope.map(x => x / envMax);

        // --- Temporal envelope (16 segments) ---
        const nSegments = 16;
        const segLen = Math.floor(rmsValues.length / nSegments);
        const temporalEnvelope = [];
        for (let i = 0; i < nSegments; i++) {
            const start = i * segLen;
            const end = i < nSegments - 1 ? start + segLen : rmsValues.length;
            const seg = rmsValues.slice(start, end);
            temporalEnvelope.push(this._mean(seg));
        }
        const tempMax = Math.max(...temporalEnvelope, 0.0001);
        const normTemporalEnvelope = temporalEnvelope.map(x => x / tempMax);

        return {
            duration: Math.round(duration * 1000) / 1000,
            dominantFreq: Math.round(dominantFreq * 10) / 10,
            freqLow: Math.round(freqLow * 10) / 10,
            freqHigh: Math.round(freqHigh * 10) / 10,
            spectralCentroid: Math.round(spectralCentroid * 10) / 10,
            spectralBandwidth: Math.round(spectralBandwidth * 10) / 10,
            spectralRolloff: Math.round(spectralRolloff * 10) / 10,
            meanRMS: Math.round(meanRMS * 1000000) / 1000000,
            zcr: Math.round(zcr * 1000000) / 1000000,
            tempo: Math.round(tempo * 10) / 10,
            numOnsets: numOnsets,
            meanOnsetInterval: Math.round(meanOnsetInterval * 10000) / 10000,
            onsetRegularity: Math.round(onsetRegularity * 10000) / 10000,
            repetitionRate: Math.round(repetitionRate * 1000) / 1000,
            mfccMean: mfccs.mean,
            mfccStd: mfccs.std,
            bandEnergies: normBandEnergies.map(x => Math.round(x * 10000) / 10000),
            spectralEnvelope: normSpectralEnvelope.map(x => Math.round(x * 10000) / 10000),
            temporalEnvelope: normTemporalEnvelope.map(x => Math.round(x * 10000) / 10000)
        };
    }

    // ==========================================
    // STEP 2: FILTERING
    // ==========================================

    filterCandidates(filters) {
        if (!this.isLoaded) return [];
        let candidates = [...this.featuresDB.birds];

        if (filters.hotspot) {
            const hotspotLower = filters.hotspot.toLowerCase();
            candidates = candidates.filter(bird => {
                const h = (bird.hotspot || '').toLowerCase();
                return h.includes(hotspotLower);
            });
        }

        if (filters.habitat) {
            const habitatLower = filters.habitat.toLowerCase();
            candidates = candidates.filter(bird => {
                const h = (bird.habitat || '').toLowerCase();
                return h.includes(habitatLower);
            });
        }

        if (filters.birdgroup) {
            const groupLower = filters.birdgroup.toLowerCase();
            candidates = candidates.filter(bird => {
                const g = (bird.birdgroup || '').toLowerCase();
                return g === groupLower;
            });
        }

        return candidates;
    }

    getUniqueHotspots() {
        if (!this.isLoaded) return [];
        const hotspots = new Set();
        this.featuresDB.birds.forEach(bird => {
            if (bird.hotspot) {
                bird.hotspot.split(';').forEach(h => {
                    const trimmed = h.trim();
                    // Extract the region name (before "Other" or "Special")
                    const base = trimmed.replace(/\s+(Other|Special)$/i, '').trim();
                    if (base) hotspots.add(base);
                });
            }
        });
        return [...hotspots].sort();
    }

    getUniqueHabitats() {
        if (!this.isLoaded) return [];
        const habitats = new Set();
        this.featuresDB.birds.forEach(bird => {
            if (bird.habitat) {
                bird.habitat.split(';').forEach(h => {
                    const trimmed = h.trim();
                    if (trimmed) habitats.add(trimmed);
                });
            }
        });
        return [...habitats].sort();
    }

    getUniqueBirdgroups() {
        if (!this.isLoaded) return [];
        const groups = new Set();
        this.featuresDB.birds.forEach(bird => {
            if (bird.birdgroup) groups.add(bird.birdgroup);
        });
        return [...groups].sort();
    }

    // ==========================================
    // STEP 3: FAST CANDIDATE SEARCH
    // ==========================================

    fastSearch(userFeatures, candidates, topN = 20) {
        if (!candidates || candidates.length === 0) return [];

        const scored = candidates.map(bird => {
            const bf = bird.features;
            if (!bf) return { bird, score: 0 };

            let score = 0;
            let totalWeight = 0;

            // 1. Dominant frequency similarity (weight: 20)
            const freqDiff = Math.abs(userFeatures.dominantFreq - bf.dominantFreq);
            const maxFreqDiff = 3000; // Hz
            const freqScore = Math.max(0, 1 - freqDiff / maxFreqDiff);
            score += freqScore * 20;
            totalWeight += 20;

            // 2. Frequency range overlap (weight: 15)
            const overlapLow = Math.max(userFeatures.freqLow, bf.freqLow);
            const overlapHigh = Math.min(userFeatures.freqHigh, bf.freqHigh);
            const overlap = Math.max(0, overlapHigh - overlapLow);
            const userRange = userFeatures.freqHigh - userFeatures.freqLow;
            const birdRange = bf.freqHigh - bf.freqLow;
            const maxRange = Math.max(userRange, birdRange, 1);
            const rangeScore = overlap / maxRange;
            score += rangeScore * 15;
            totalWeight += 15;

            // 3. Spectral centroid similarity (weight: 10)
            const centroidDiff = Math.abs(userFeatures.spectralCentroid - bf.spectralCentroid);
            const centroidScore = Math.max(0, 1 - centroidDiff / 3000);
            score += centroidScore * 10;
            totalWeight += 10;

            // 4. MFCC similarity (weight: 25)
            if (userFeatures.mfccMean && bf.mfccMean) {
                const mfccScore = this._cosineSimilarity(userFeatures.mfccMean, bf.mfccMean);
                score += Math.max(0, mfccScore) * 25;
            }
            totalWeight += 25;

            // 5. Rhythm / repetition similarity (weight: 10)
            if (userFeatures.repetitionRate > 0 && bf.repetitionRate > 0) {
                const rrDiff = Math.abs(userFeatures.repetitionRate - bf.repetitionRate);
                const rrMax = Math.max(userFeatures.repetitionRate, bf.repetitionRate, 1);
                const rrScore = Math.max(0, 1 - rrDiff / rrMax);
                score += rrScore * 10;
            }
            totalWeight += 10;

            // 6. Band energy distribution similarity (weight: 10)
            if (userFeatures.bandEnergies && bf.bandEnergies) {
                const bandScore = this._cosineSimilarity(userFeatures.bandEnergies, bf.bandEnergies);
                score += Math.max(0, bandScore) * 10;
            }
            totalWeight += 10;

            // 7. Spectral envelope similarity (weight: 10)
            if (userFeatures.spectralEnvelope && bf.spectralEnvelope) {
                const envScore = this._cosineSimilarity(userFeatures.spectralEnvelope, bf.spectralEnvelope);
                score += Math.max(0, envScore) * 10;
            }
            totalWeight += 10;

            const finalScore = totalWeight > 0 ? (score / totalWeight) * 100 : 0;

            return { bird, score: Math.round(finalScore * 10) / 10 };
        });

        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, topN);
    }

    // ==========================================
    // STEP 4: DETAILED SPECTROGRAM COMPARISON
    // ==========================================

    async detailedComparison(userSamples, userSampleRate, topCandidates, topN = 5, userFeatures = null) {
        // Generate user spectrogram data
        const userSpectro = this._generateSpectrogramData(userSamples, userSampleRate);

        // Use pre-computed features if provided, otherwise extract
        if (!userFeatures) {
            userFeatures = this.extractFeatures(userSamples, userSampleRate);
        }

        const results = [];
        for (const candidate of topCandidates) {
            const bird = candidate.bird;
            const bf = bird.features;

            // Try detailed spectrogram comparison via reference audio
            let refSpectroScore = 0;
            let usedFullComparison = false;
            try {
                const refAudio = await this.loadAudio(bird.audio);
                const refSpectro = this._generateSpectrogramData(refAudio.samples, refAudio.sampleRate);
                refSpectroScore = this._compareSpectrograms(userSpectro, refSpectro);
                usedFullComparison = true;
            } catch (e) {
                console.warn(`Could not load reference audio for ${bird.english}, using cached features`);
                // Fallback: compare spectral + temporal envelopes from cached features
                if (bf && userFeatures) {
                    const envScore = bf.spectralEnvelope && userFeatures.spectralEnvelope
                        ? this._cosineSimilarity(userFeatures.spectralEnvelope, bf.spectralEnvelope) : 0;
                    const tempScore = bf.temporalEnvelope && userFeatures.temporalEnvelope
                        ? this._cosineSimilarity(userFeatures.temporalEnvelope, bf.temporalEnvelope) : 0;
                    const mfccScore = bf.mfccMean && userFeatures.mfccMean
                        ? this._cosineSimilarity(userFeatures.mfccMean, bf.mfccMean) : 0;
                    refSpectroScore = (Math.max(0, envScore) * 40 + Math.max(0, tempScore) * 30 + Math.max(0, mfccScore) * 30);
                }
            }

            // Combine: fast search 60%, detailed comparison 40%
            const combinedScore = usedFullComparison
                ? candidate.score * 0.6 + refSpectroScore * 0.4
                : candidate.score * 0.7 + refSpectroScore * 0.3;

            results.push({
                bird: bird,
                fastScore: candidate.score,
                spectrogramScore: Math.round(refSpectroScore * 10) / 10,
                combinedScore: Math.round(combinedScore * 10) / 10,
                score: Math.round(combinedScore * 10) / 10
            });
        }

        results.sort((a, b) => b.combinedScore - a.combinedScore);
        return results.slice(0, topN);
    }

    _generateSpectrogramData(samples, sampleRate) {
        const fftSize = this.N_FFT;
        const hopLength = this.HOP_LENGTH;
        const numFrames = Math.floor((samples.length - fftSize) / hopLength);
        const numBins = fftSize / 2 + 1;
        const birdBinLow = Math.floor(this.FREQ_MIN * fftSize / sampleRate);
        const birdBinHigh = Math.min(Math.floor(this.FREQ_MAX * fftSize / sampleRate), numBins - 1);

        const data = [];
        for (let f = 0; f < numFrames; f++) {
            const start = f * hopLength;
            const frame = samples.slice(start, start + fftSize);
            const spectrum = this._fft(frame);
            data.push(spectrum.slice(birdBinLow, birdBinHigh + 1));
        }

        return { data, numFrames, numBins: birdBinHigh - birdBinLow + 1 };
    }

    _compareSpectrograms(spectroA, spectroB) {
        // Normalize both spectrograms to same time length using resampling
        const targetFrames = 64; // Compare at 64 time points
        const targetBins = Math.min(spectroA.numBins, spectroB.numBins);

        const normA = this._normalizeSpectrogram(spectroA.data, targetFrames, targetBins);
        const normB = this._normalizeSpectrogram(spectroB.data, targetFrames, targetBins);

        // Compute similarity using correlation
        let similarity = 0;
        for (let t = 0; t < targetFrames; t++) {
            const corrVal = this._cosineSimilarity(normA[t], normB[t]);
            similarity += Math.max(0, corrVal);
        }
        similarity /= targetFrames;

        return similarity * 100;
    }

    _normalizeSpectrogram(data, targetFrames, targetBins) {
        const result = [];
        for (let t = 0; t < targetFrames; t++) {
            const srcFrame = Math.floor(t * data.length / targetFrames);
            const frame = data[Math.min(srcFrame, data.length - 1)];
            const resized = this._resampleArray(Array.from(frame), targetBins);

            // Normalize frame
            const frameMax = Math.max(...resized, 0.0001);
            result.push(resized.map(x => x / frameMax));
        }
        return result;
    }

    // ==========================================
    // FULL IDENTIFICATION WORKFLOW
    // ==========================================

    async identify(audioSource, filters = {}, progressCallback = null) {
        const progress = (msg, pct) => {
            if (progressCallback) progressCallback(msg, pct);
        };

        progress('Loading audio...', 5);
        const { samples, sampleRate, duration } = await this.loadAudio(audioSource);

        // Step 1: Quality Assessment
        progress('Assessing recording quality...', 10);
        const quality = this.assessQuality(samples, sampleRate);

        // Step 2: Extract features
        progress('Extracting audio features...', 20);
        const userFeatures = this.extractFeatures(samples, sampleRate);

        // Step 3: Filter candidates
        progress('Filtering candidates...', 30);
        let candidates = this.filterCandidates(filters);
        if (candidates.length === 0) {
            // Fall back to all birds if filter is too restrictive
            candidates = [...this.featuresDB.birds];
        }
        progress(`Searching ${candidates.length} recordings...`, 40);

        // Step 4: Fast candidate search
        progress('Running fast frequency analysis...', 50);
        const fastResults = this.fastSearch(userFeatures, candidates, 10);

        // Step 5: Detailed spectrogram comparison for top candidates
        progress('Comparing spectrograms (this may take a moment)...', 60);
        let detailedResults;
        try {
            detailedResults = await this.detailedComparison(
                samples, sampleRate, fastResults, 5, userFeatures
            );
        } catch (e) {
            console.warn('Detailed comparison failed, using fast results:', e);
            detailedResults = fastResults.slice(0, 5).map(r => ({
                ...r,
                fastScore: r.score,
                spectrogramScore: 0,
                combinedScore: r.score,
                score: r.score
            }));
        }

        progress('Preparing results...', 90);

        // Determine confidence
        let confidence = 'low';
        if (detailedResults.length > 0) {
            const topScore = detailedResults[0].score;
            if (topScore >= 70) confidence = 'high';
            else if (topScore >= 50) confidence = 'medium';
        }

        progress('Done!', 100);

        return {
            quality,
            userFeatures,
            results: detailedResults,
            confidence,
            totalCandidates: candidates.length,
            duration: userFeatures.duration
        };
    }

    // ==========================================
    // DSP UTILITIES
    // ==========================================

    _fft(frame) {
        // Real FFT using the Cooley-Tukey algorithm
        const n = frame.length;
        const real = new Float32Array(n);
        const imag = new Float32Array(n);

        // Apply Hann window
        for (let i = 0; i < n; i++) {
            real[i] = (frame[i] || 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / n));
        }

        // Bit-reversal permutation
        let j = 0;
        for (let i = 0; i < n; i++) {
            if (j > i) {
                [real[i], real[j]] = [real[j], real[i]];
                [imag[i], imag[j]] = [imag[j], imag[i]];
            }
            let m = n >> 1;
            while (m >= 1 && j >= m) {
                j -= m;
                m >>= 1;
            }
            j += m;
        }

        // FFT butterfly
        for (let size = 2; size <= n; size *= 2) {
            const halfSize = size / 2;
            const angle = -2 * Math.PI / size;
            const wReal = Math.cos(angle);
            const wImag = Math.sin(angle);

            for (let i = 0; i < n; i += size) {
                let curReal = 1, curImag = 0;
                for (let k = 0; k < halfSize; k++) {
                    const tReal = curReal * real[i + k + halfSize] - curImag * imag[i + k + halfSize];
                    const tImag = curReal * imag[i + k + halfSize] + curImag * real[i + k + halfSize];

                    real[i + k + halfSize] = real[i + k] - tReal;
                    imag[i + k + halfSize] = imag[i + k] - tImag;
                    real[i + k] += tReal;
                    imag[i + k] += tImag;

                    const newCurReal = curReal * wReal - curImag * wImag;
                    curImag = curReal * wImag + curImag * wReal;
                    curReal = newCurReal;
                }
            }
        }

        // Magnitude spectrum (only positive frequencies)
        const numBins = n / 2 + 1;
        const magnitude = new Float32Array(numBins);
        for (let i = 0; i < numBins; i++) {
            magnitude[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]) / n;
        }

        return magnitude;
    }

    _computeMFCC(spectrogram, sampleRate, numBins) {
        // Simplified MFCC computation
        const nMelFilters = 26;
        const nMFCC = this.N_MFCC;
        const numFrames = spectrogram.length;

        // Create mel filterbank
        const melFilters = this._createMelFilterbank(nMelFilters, numBins, sampleRate);

        // Apply filterbank to each frame
        const mfccAll = [];
        for (let f = 0; f < numFrames; f++) {
            // Apply mel filters
            const melEnergies = new Float32Array(nMelFilters);
            for (let m = 0; m < nMelFilters; m++) {
                let sum = 0;
                for (let k = 0; k < numBins; k++) {
                    sum += spectrogram[f][k] * spectrogram[f][k] * melFilters[m][k];
                }
                melEnergies[m] = Math.log(Math.max(sum, 1e-10));
            }

            // DCT to get MFCCs
            const mfcc = new Float32Array(nMFCC);
            for (let i = 0; i < nMFCC; i++) {
                let sum = 0;
                for (let j = 0; j < nMelFilters; j++) {
                    sum += melEnergies[j] * Math.cos(Math.PI * i * (j + 0.5) / nMelFilters);
                }
                mfcc[i] = sum;
            }
            mfccAll.push(mfcc);
        }

        // Compute mean and std across frames
        const mean = new Float32Array(nMFCC);
        const std = new Float32Array(nMFCC);

        for (let i = 0; i < nMFCC; i++) {
            let sum = 0;
            for (let f = 0; f < numFrames; f++) {
                sum += mfccAll[f][i];
            }
            mean[i] = sum / numFrames;
        }

        for (let i = 0; i < nMFCC; i++) {
            let sum = 0;
            for (let f = 0; f < numFrames; f++) {
                const diff = mfccAll[f][i] - mean[i];
                sum += diff * diff;
            }
            std[i] = Math.sqrt(sum / numFrames);
        }

        return {
            mean: Array.from(mean).map(x => Math.round(x * 10000) / 10000),
            std: Array.from(std).map(x => Math.round(x * 10000) / 10000)
        };
    }

    _createMelFilterbank(nFilters, numBins, sampleRate) {
        const fftSize = (numBins - 1) * 2;
        const melLow = this._hzToMel(this.FREQ_MIN);
        const melHigh = this._hzToMel(Math.min(this.FREQ_MAX, sampleRate / 2));
        const melPoints = [];
        for (let i = 0; i <= nFilters + 1; i++) {
            melPoints.push(this._melToHz(melLow + (melHigh - melLow) * i / (nFilters + 1)));
        }

        const filters = [];
        for (let m = 0; m < nFilters; m++) {
            const filter = new Float32Array(numBins);
            const fLeft = melPoints[m];
            const fCenter = melPoints[m + 1];
            const fRight = melPoints[m + 2];

            for (let k = 0; k < numBins; k++) {
                const freq = k * sampleRate / fftSize;
                if (freq >= fLeft && freq <= fCenter) {
                    filter[k] = (freq - fLeft) / (fCenter - fLeft + 1e-10);
                } else if (freq > fCenter && freq <= fRight) {
                    filter[k] = (fRight - freq) / (fRight - fCenter + 1e-10);
                }
            }
            filters.push(filter);
        }
        return filters;
    }

    _hzToMel(hz) {
        return 2595 * Math.log10(1 + hz / 700);
    }

    _melToHz(mel) {
        return 700 * (Math.pow(10, mel / 2595) - 1);
    }

    _estimateTempo(onsetEnv, sampleRate) {
        // Autocorrelation-based tempo estimation
        const maxLag = Math.min(onsetEnv.length, Math.floor(4 * sampleRate / this.HOP_LENGTH)); // Up to 4s
        const minLag = Math.floor(0.2 * sampleRate / this.HOP_LENGTH); // At least 0.2s

        let bestLag = minLag;
        let bestCorr = -Infinity;

        for (let lag = minLag; lag < maxLag; lag++) {
            let corr = 0;
            let count = 0;
            for (let i = 0; i < onsetEnv.length - lag; i++) {
                corr += onsetEnv[i] * onsetEnv[i + lag];
                count++;
            }
            corr /= count || 1;

            if (corr > bestCorr) {
                bestCorr = corr;
                bestLag = lag;
            }
        }

        const periodSeconds = bestLag * this.HOP_LENGTH / sampleRate;
        const bpm = periodSeconds > 0 ? 60 / periodSeconds : 0;
        return Math.min(bpm, 300); // Cap at 300 BPM
    }

    _cosineSimilarity(a, b) {
        const len = Math.min(a.length, b.length);
        let dotProduct = 0, normA = 0, normB = 0;
        for (let i = 0; i < len; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        const denom = Math.sqrt(normA) * Math.sqrt(normB);
        return denom > 0 ? dotProduct / denom : 0;
    }

    _mean(arr) {
        if (arr.length === 0) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    _std(arr) {
        if (arr.length === 0) return 0;
        const m = this._mean(arr);
        const sqDiffs = arr.map(x => (x - m) * (x - m));
        return Math.sqrt(this._mean(sqDiffs));
    }

    _resampleArray(arr, targetLen) {
        if (arr.length === 0) return new Array(targetLen).fill(0);
        if (arr.length === targetLen) return arr;

        const result = [];
        for (let i = 0; i < targetLen; i++) {
            const srcIdx = i * (arr.length - 1) / (targetLen - 1);
            const low = Math.floor(srcIdx);
            const high = Math.min(low + 1, arr.length - 1);
            const frac = srcIdx - low;
            result.push(arr[low] * (1 - frac) + arr[high] * frac);
        }
        return result;
    }
}

// ==========================================
// RECORDING MANAGER
// ==========================================

class BirdRecorder {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.stream = null;
        this.isRecording = false;
        this.analyserNode = null;
        this.audioContext = null;
        this.onLevelUpdate = null;     // Callback for live level meter
        this.onBirdDetected = null;    // Callback for live bird detection
        this.animationFrame = null;
    }

    async start() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    sampleRate: 44100
                }
            });

            // Set up analyzer for live feedback
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = this.audioContext.createMediaStreamSource(this.stream);
            this.analyserNode = this.audioContext.createAnalyser();
            this.analyserNode.fftSize = 2048;
            source.connect(this.analyserNode);

            // Set up recorder
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : 'audio/webm';
            this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) this.audioChunks.push(e.data);
            };

            this.mediaRecorder.start(100); // Collect in 100ms chunks
            this.isRecording = true;

            // Start live analysis
            this._startLiveAnalysis();

            return true;
        } catch (e) {
            console.error('Recording failed:', e);
            return false;
        }
    }

    stop() {
        return new Promise((resolve) => {
            if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
                resolve(null);
                return;
            }

            this.mediaRecorder.onstop = () => {
                const blob = new Blob(this.audioChunks, { type: this.mediaRecorder.mimeType });
                this.isRecording = false;
                this._stopLiveAnalysis();

                if (this.stream) {
                    this.stream.getTracks().forEach(t => t.stop());
                    this.stream = null;
                }
                if (this.audioContext) {
                    this.audioContext.close();
                    this.audioContext = null;
                }

                resolve(blob);
            };

            this.mediaRecorder.stop();
        });
    }

    _startLiveAnalysis() {
        const bufferLength = this.analyserNode.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        const freqData = new Uint8Array(bufferLength);

        const analyze = () => {
            if (!this.isRecording) return;

            // Time domain for level
            this.analyserNode.getByteTimeDomainData(dataArray);
            let maxAmplitude = 0;
            for (let i = 0; i < bufferLength; i++) {
                const amplitude = Math.abs(dataArray[i] - 128) / 128;
                if (amplitude > maxAmplitude) maxAmplitude = amplitude;
            }

            if (this.onLevelUpdate) {
                this.onLevelUpdate(maxAmplitude);
            }

            // Frequency domain for bird detection
            this.analyserNode.getByteFrequencyData(freqData);
            const sampleRate = this.audioContext.sampleRate;
            const binSize = sampleRate / this.analyserNode.fftSize;
            const birdLow = Math.floor(500 / binSize);
            const birdHigh = Math.floor(10000 / binSize);

            let birdEnergy = 0;
            let noiseEnergy = 0;
            for (let i = birdLow; i < birdHigh && i < bufferLength; i++) {
                birdEnergy += freqData[i];
            }
            for (let i = 0; i < birdLow; i++) {
                noiseEnergy += freqData[i];
            }

            const birdDetected = birdEnergy > noiseEnergy * 2 && birdEnergy > 5000;
            if (this.onBirdDetected) {
                this.onBirdDetected(birdDetected, birdEnergy, noiseEnergy);
            }

            this.animationFrame = requestAnimationFrame(analyze);
        };

        analyze();
    }

    _stopLiveAnalysis() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }
}
