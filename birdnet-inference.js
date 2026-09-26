/**
 * BirdNET V3 acoustic inference — standalone module.
 *
 * PHASE 2A ONLY: Audio -> 32kHz mono -> BirdNET V3 -> raw acoustic Top-N.
 *
 * This module is DELIBERATELY self-contained and knows nothing about the
 * existing MFCC-based BirdAudioAnalyzer/BirdRecorder in audio-analyzer.js.
 * It does not read from or write to any of that code, and is not built
 * around its assumptions — per the explicit instruction that BirdNET must
 * become its own identification engine, not a feature bolted onto the old
 * MFCC system.
 *
 * The logic here (model loading, CSV label parsing, decode+resample,
 * chunk planning, inference, Top-N aggregation) is a direct, unmodified port
 * of the already-tested logic in birdnet-test.js (the standalone BirdNET
 * test harness), so this module's behaviour matches what has already been
 * validated there. No Geo Model, no SABAP2, no Protected Acoustic ranking,
 * and no UI are implemented here — those are later phases (2B/2C/2D).
 *
 * The raw acoustic score returned by getTopN() is used EXACTLY as the model
 * outputs it (no softmax/sigmoid/rescaling) and must be treated as a raw
 * acoustic evidence signal, not a calibrated probability.
 */
(function (root) {
  "use strict";

  const CONFIG = {
    // Served from THIS app's own origin (models/ folder), not fetched from
    // Zenodo directly — Zenodo does not send permissive CORS headers for
    // this project's origin (confirmed repeatedly), so a direct cross-origin
    // fetch from the browser fails there. Serving the same files locally
    // (same-origin) avoids the CORS restriction entirely and is also the
    // correct approach for a real deployment: these two files should be
    // deployed as ordinary static assets alongside allbirds.js, photos, and
    // audio files, not fetched from a third-party research repository at
    // runtime. When this app is deployed, copy the models/ folder along
    // with everything else.
    MODEL_URL: "models/BirdNET+_V3.0-preview3.1_Global_11K_FP16_pruned.onnx",
    LABELS_URL: "models/BirdNET+_V3.0-preview3.1_Global_11K_Labels.csv",
    SAMPLE_RATE: 32000,
    CHUNK_LENGTH_SEC: 3,
    OVERLAP_SEC: 0,
    BATCH_SIZE: 1,
    TOP_N: 20,
    ORT_VERSION: "1.26.0",
    // Bump this if the model/labels files at MODEL_URL/LABELS_URL are ever
    // replaced with a different version — a new cache name means old cached
    // bytes are never mistakenly reused for a different model.
    CACHE_NAME: "birdnet-v3-model-cache-v1",
  };

  // ---------------------------------------------------------------------
  // Cache Storage helper — avoids re-downloading the ~68MB model (and the
  // labels file) on every page load. Uses the browser's Cache Storage API
  // directly (no Service Worker registration needed to just read/write a
  // named cache), which requires a secure context (HTTPS or localhost) —
  // exactly what this app is already served over. If Cache Storage is
  // unavailable for any reason, this falls back to a plain fetch() rather
  // than failing — caching is a performance optimization, never a
  // correctness requirement.
  // ---------------------------------------------------------------------
  async function readResponseWithProgress(response, onProgress) {
    if (!onProgress) return response;
    const totalHeader = response.headers && response.headers.get("content-length");
    const total = totalHeader ? Number(totalHeader) : null;
    if (!response.body || !response.body.getReader || !Number.isFinite(total) || total <= 0) {
      onProgress({ loaded: 0, total: null, indeterminate: true });
      return response;
    }

    const reader = response.body.getReader();
    const chunks = [];
    let loaded = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) {
        console.log('[BIRDNET LOAD STREAM DONE]', {
          loaded,
          total,
          timestamp: performance.now(),
        });
        break;
      }
      if (part.value && part.value.byteLength) {
        chunks.push(part.value);
        loaded += part.value.byteLength;
        const progressTotal = loaded <= total ? total : null;
        onProgress({
          loaded,
          total: progressTotal,
          indeterminate: progressTotal === null,
        });
      }
    }
    return new Response(new Blob(chunks), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }

  async function fetchWithCache(url, onProgress) {
    if (typeof caches === "undefined") {
      return { response: await readResponseWithProgress(await fetch(url), onProgress), fromCache: false };
    }
    try {
      const cache = await caches.open(CONFIG.CACHE_NAME);
      const cached = await cache.match(url);
      if (cached) {
        return { response: await readResponseWithProgress(cached, onProgress), fromCache: true };
      }
      const response = await fetch(url);
      if (response.ok) {
        // Response bodies can only be consumed once — cache a clone, use
        // the original for the caller.
        cache.put(url, response.clone()).catch((err) => {
          console.warn("[BirdNetInference] Failed to cache", url, err);
        });
      }
      return { response: await readResponseWithProgress(response, onProgress), fromCache: false };
    } catch (err) {
      console.warn("[BirdNetInference] Cache Storage unavailable, falling back to plain fetch:", err);
      return { response: await readResponseWithProgress(await fetch(url), onProgress), fromCache: false };
    }
  }

  // ---------------------------------------------------------------------
  // Lazy ONNX Runtime Web loader — the ~ort library is only fetched the
  // first time BirdNET is actually used, so it never adds load time/weight
  // to the existing app unless a caller explicitly triggers BirdNET.
  // ---------------------------------------------------------------------
  let ortLoadingPromise = null;
  function ensureOrtLoaded() {
    const configureOrtWasmPath = () => {
      if (window.ort && window.ort.env && window.ort.env.wasm) {
        window.ort.env.wasm.wasmPaths = "models/onnxruntime/";
      }
    };
    if (typeof window.ort !== "undefined") {
      configureOrtWasmPath();
      return Promise.resolve();
    }
    if (ortLoadingPromise) return ortLoadingPromise;
    ortLoadingPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "models/onnxruntime/ort.min.js";
      script.onload = () => {
        configureOrtWasmPath();
        resolve();
      };
      script.onerror = () => reject(new Error("Failed to load local onnxruntime-web."));
      document.head.appendChild(script);
    });
    return ortLoadingPromise;
  }

  // ---------------------------------------------------------------------
  // CSV label parsing — direct port of birdnet-test.js parseCsvLine() /
  // parseLabelsCsv() / verifyLabelOrdering().
  // ---------------------------------------------------------------------
  function parseCsvLine(line, delimiter) {
    const fields = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (char === delimiter && !inQuotes) {
        fields.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    fields.push(current);
    return fields;
  }

  function parseLabelsCsv(csvText) {
    const lines = csvText.trim().split(/\r?\n/);
    if (lines.length === 0) return [];
    const header = parseCsvLine(lines[0], ";");
    const idxCol = header.indexOf("idx");
    const idCol = header.indexOf("id");
    const sciCol = header.indexOf("sci_name");
    const comCol = header.indexOf("com_name");
    const classCol = header.indexOf("class");
    const orderCol = header.indexOf("order");

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const cols = parseCsvLine(lines[i], ";");
      rows.push({
        rowPosition: rows.length, // this IS the model output index, per official implementation
        csvIdx: idxCol >= 0 ? parseInt(cols[idxCol], 10) : NaN,
        id: idCol >= 0 ? (cols[idCol] || "").trim() : "",
        sci: sciCol >= 0 ? (cols[sciCol] || "").trim() : "",
        com: comCol >= 0 ? (cols[comCol] || "").trim() : "",
        cls: classCol >= 0 ? (cols[classCol] || "").trim() : "",
        order: orderCol >= 0 ? (cols[orderCol] || "").trim() : "",
      });
    }
    return rows;
  }

  function verifyLabelOrdering(rows) {
    let mismatches = 0;
    for (let i = 0; i < rows.length; i++) {
      if (!Number.isNaN(rows[i].csvIdx) && rows[i].csvIdx !== i) mismatches++;
    }
    return mismatches;
  }

  // ---------------------------------------------------------------------
  // Audio decode + resample — direct port of birdnet-test.js
  // decodeAndResample(). Works on any Blob/File (MediaRecorder output is a
  // Blob, which has .arrayBuffer() just like File does). The source
  // blob/file itself is never modified — only a decoded copy is processed.
  // ---------------------------------------------------------------------
  async function decodeAndResample(blob, targetSampleRate) {
    const arrayBuffer = await blob.arrayBuffer();

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const decodeCtx = new AudioContextClass();
    let originalBuffer;
    try {
      originalBuffer = await decodeCtx.decodeAudioData(arrayBuffer);
    } finally {
      await decodeCtx.close();
    }

    const originalSampleRate = originalBuffer.sampleRate;
    const originalChannels = originalBuffer.numberOfChannels;
    const duration = originalBuffer.duration;

    // OfflineAudioContext with 1 output channel performs the mono downmix
    // AND the sample-rate conversion (browser's built-in high-quality
    // resampler) in one step.
    const targetLength = Math.ceil(duration * targetSampleRate);
    const offlineCtx = new OfflineAudioContext(1, targetLength, targetSampleRate);
    const sourceNode = offlineCtx.createBufferSource();
    sourceNode.buffer = originalBuffer;
    sourceNode.connect(offlineCtx.destination);
    sourceNode.start(0);

    const renderedBuffer = await offlineCtx.startRendering();
    const samples = new Float32Array(renderedBuffer.getChannelData(0)); // copy

    return { samples, originalSampleRate, originalChannels, duration };
  }

  // ---------------------------------------------------------------------
  // Chunk planning — direct port of birdnet-test.js planAudioChunks().
  // Short/trailing chunks are handled by zero-padding in runInference()
  // below (the input Float32Array defaults to zero; only `toCopy` samples
  // are actually written), exactly as in the official implementation.
  // ---------------------------------------------------------------------
  function planAudioChunks(audioLength, chunkLengthSec, overlapSec, sampleRate) {
    const chunkSamples = Math.floor(chunkLengthSec * sampleRate);
    const hopSamples = Math.max(1, Math.floor((chunkLengthSec - overlapSec) * sampleRate));

    const starts = [];
    const spans = [];
    for (let s = 0; s < audioLength; s += hopSamples) {
      const e = Math.min(s + chunkSamples, audioLength);
      starts.push(s);
      spans.push([s / sampleRate, e / sampleRate]);
      if (e >= audioLength) break;
    }
    return { starts, spans, chunkSamples };
  }

  function findPredictionTensor(outputs, labelCount) {
    const entries = Object.entries(outputs);
    const byLabelCount = entries.find(([, t]) => t.dims && t.dims.length === 2 && t.dims[1] === labelCount);
    if (byLabelCount) return byLabelCount[1];
    console.warn("[BirdNetInference] No output matched label count exactly; falling back to first output tensor.");
    return entries[0][1];
  }

  // ---------------------------------------------------------------------
  // Inference — direct port of birdnet-test.js runInference(). Per-species
  // MAXIMUM confidence across all chunks is used to summarize a multi-chunk
  // recording into one Top-N list (same aggregation birdnet-test.js uses) —
  // this is a summarization choice, NOT a modification of the model's own
  // per-chunk output values, which are used completely unmodified (no
  // softmax/sigmoid/rescaling).
  // ---------------------------------------------------------------------
  async function runInference(sess, rows, audioSamples, sampleRate, chunkLengthSec, overlapSec, batchSize, onProgress) {
    const { starts, chunkSamples } = planAudioChunks(audioSamples.length, chunkLengthSec, overlapSec, sampleRate);
    const labelCount = rows.length;

    if (!starts.length) {
      return { maxConfidence: new Float32Array(0), durationMs: 0, numChunks: 0 };
    }

    const maxConfidence = new Float32Array(labelCount).fill(-Infinity);

    const tStart = performance.now();
    for (let i = 0; i < starts.length; i += batchSize) {
      const batchCount = Math.min(batchSize, starts.length - i);

      // Input tensor: [batchCount, chunkSamples] raw PCM float32 samples.
      // The V3 ONNX graph computes its own mel-spectrogram internally — raw
      // waveform samples are fed directly, no precomputed spectrogram.
      const input = new Float32Array(batchCount * chunkSamples);
      for (let b = 0; b < batchCount; b++) {
        const startSample = starts[i + b];
        const available = Math.max(0, audioSamples.length - startSample);
        const toCopy = Math.min(chunkSamples, available);
        if (toCopy > 0) {
          input.set(audioSamples.subarray(startSample, startSample + toCopy), b * chunkSamples);
        }
        // Remaining samples (if toCopy < chunkSamples, e.g. the last, short
        // chunk) stay zero — Float32Array is zero-initialized by default.
      }

      const tensor = new window.ort.Tensor("float32", input, [batchCount, chunkSamples]);
      const feeds = { input: tensor };

      const results = await sess.run(feeds);
      const predTensor = findPredictionTensor(results, labelCount);
      const predictions = predTensor.data;
      const outputDim = (predTensor.dims && predTensor.dims[1]) || labelCount;

      for (let b = 0; b < batchCount; b++) {
        const offset = b * outputDim;
        for (let c = 0; c < labelCount; c++) {
          // Confidence used EXACTLY as the model outputs it — no softmax,
          // no sigmoid, no rescaling. Treated as raw acoustic evidence only.
          const conf = predictions[offset + c];
          if (conf > maxConfidence[c]) maxConfidence[c] = conf;
        }
      }

      if (onProgress) onProgress(Math.min(i + batchCount, starts.length), starts.length);
      await new Promise((resolve) => setTimeout(resolve, 0)); // keep UI responsive
    }
    const durationMs = performance.now() - tStart;

    return { maxConfidence, durationMs, numChunks: starts.length };
  }

  function getTopN(maxConfidence, rows, n) {
    n = n || CONFIG.TOP_N;
    const indices = Array.from({ length: rows.length }, (_, i) => i);
    indices.sort((a, b) => maxConfidence[b] - maxConfidence[a]);
    return indices.slice(0, n).map((idx, i) => ({
      rank: i + 1,
      idx,
      id: rows[idx].id,
      sci: rows[idx].sci,
      com: rows[idx].com,
      confidence: maxConfidence[idx], // raw acoustic evidence, 0-1, unmodified
    }));
  }

  /**
   * BirdNetInference — the public API. Entirely self-contained: does not
   * read/write any BirdAudioAnalyzer/BirdRecorder state.
   */
  class BirdNetInference {
    constructor() {
      this.session = null;
      this.labelRows = [];
      this.isLoaded = false;
      this.loadInfo = null;
      this.loadedFromCache = false;
    }

    /**
     * Loads the model + labels from this app's own origin (CONFIG.MODEL_URL/
     * LABELS_URL — see the models/ folder). Same-origin, so no CORS
     * restriction applies. A failure here most likely means the files are
     * missing from the deployed/served directory, not a CORS issue.
     */
    async loadModel(onStatus, onProgress) {
      const status = onStatus || (() => {});
      const birdnetLoadTiming = { start: performance.now() };
      console.log('[BIRDNET LOAD START]', { performanceNow: birdnetLoadTiming.start });
      status("Loading ONNX Runtime Web…");
      await ensureOrtLoaded();

      status("Checking for a cached BirdNET V3 model…");
      const tStart = performance.now();
      let modelBuffer, labelsText;
      try {
        const { response: modelResp, fromCache: modelFromCache } = await fetchWithCache(CONFIG.MODEL_URL, onProgress);
        birdnetLoadTiming.modelResponseComplete = performance.now();
        console.log('[BIRDNET LOAD MODEL RESPONSE COMPLETE]', {
          performanceNow: birdnetLoadTiming.modelResponseComplete,
          fromCache: modelFromCache,
        });
        if (!modelResp.ok) {
          throw new Error(`BirdNET model fetch failed with HTTP ${modelResp.status} — check that ${CONFIG.MODEL_URL} exists on this server.`);
        }
        status(modelFromCache ? "Loading BirdNET V3 model from browser cache (instant, no re-download)…" : "Downloading BirdNET V3 model (first time only, ~68MB)…");
        modelBuffer = await modelResp.arrayBuffer();
        birdnetLoadTiming.arrayBufferAvailable = performance.now();
        console.log('[BIRDNET LOAD ARRAYBUFFER AVAILABLE]', {
          timestamp: birdnetLoadTiming.arrayBufferAvailable,
          modelBytes: modelBuffer.byteLength,
        });

        const { response: labelsResp, fromCache: labelsFromCache } = await fetchWithCache(CONFIG.LABELS_URL);
        if (!labelsResp.ok) {
          throw new Error(`BirdNET labels fetch failed with HTTP ${labelsResp.status} — check that ${CONFIG.LABELS_URL} exists on this server.`);
        }
        status(labelsFromCache ? "Loading BirdNET V3 labels from browser cache…" : "Downloading BirdNET V3 labels…");
        labelsText = await labelsResp.text();

        this.loadedFromCache = modelFromCache && labelsFromCache;
        status("Model downloaded ✓ Preparing AI engine…");
      } catch (err) {
        throw new Error(
          `Could not load the BirdNET V3 model/labels from ${CONFIG.MODEL_URL} (${err.message}). ` +
          `Use loadModelFromLocalFiles() with locally downloaded copies as a fallback instead.`
        );
      }

      return this._finishLoad(modelBuffer, labelsText, tStart, status, birdnetLoadTiming);
    }

    /**
     * Fallback: loads the model/labels from local files the user selects
     * (e.g. already downloaded from Zenodo), exactly mirroring the fallback
     * already proven to work in birdnet-test.html when the direct Zenodo
     * fetch is blocked by CORS for a given origin.
     */
    async loadModelFromLocalFiles(modelFile, labelsFile, onStatus) {
      const status = onStatus || (() => {});
      status("Loading ONNX Runtime Web…");
      await ensureOrtLoaded();

      status("Reading local model file…");
      const tStart = performance.now();
      const modelBuffer = await modelFile.arrayBuffer();

      status("Reading local labels file…");
      const labelsText = await labelsFile.text();

      return this._finishLoad(modelBuffer, labelsText, tStart, status);
    }

    async _finishLoad(modelBuffer, labelsText, tStart, status, birdnetLoadTiming) {
      const timing = birdnetLoadTiming || { start: tStart };
      const rows = parseLabelsCsv(labelsText);
      if (!rows.length) {
        throw new Error("BirdNET labels CSV parsed to zero rows.");
      }
      const mismatches = verifyLabelOrdering(rows);
      if (mismatches > 0) {
        console.warn(`[BirdNetInference] ${mismatches} label row(s) have an "idx" that does not match row position.`);
      }

      status("Initializing ONNX Runtime Web session (WASM)…");
      timing.sessionCreateStart = performance.now();
      console.log('[BIRDNET LOAD SESSION CREATE START]', { performanceNow: timing.sessionCreateStart });
      // WASM is the only viable execution provider for this model (its
      // graph uses a DFT operator for the internal mel-spectrogram, which
      // WebGL does not support), same as birdnet-test.js.
      this.session = await window.ort.InferenceSession.create(new Uint8Array(modelBuffer), {
        executionProviders: ["wasm"],
      });
      timing.sessionCreateComplete = performance.now();
      console.log('[BIRDNET LOAD SESSION CREATE COMPLETE]', { performanceNow: timing.sessionCreateComplete });
      this.labelRows = rows;
      this.isLoaded = true;
      const readyNow = performance.now();
      this.loadInfo = { loadMs: readyNow - tStart, labelCount: rows.length };
      console.log('[BIRDNET LOAD TIMING]', {
        performanceNow: readyNow,
        modelBytes: modelBuffer.byteLength,
        modelFetchMs: timing.modelResponseComplete !== undefined
          ? timing.modelResponseComplete - timing.start : null,
        sessionCreateMs: timing.sessionCreateComplete - timing.sessionCreateStart,
        totalLoadMs: readyNow - timing.start,
        fromCache: this.loadedFromCache,
        hardwareConcurrency: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : null,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      });
      status("BirdNET V3 model ready.");
      return this.loadInfo;
    }

    /**
     * Runs Phase 2A end-to-end: audioBlob -> 32kHz mono -> BirdNET V3 ->
     * raw acoustic Top-N. Does not touch Geo Model, SABAP2, or Protected
     * Acoustic — those are later phases. Returns the exact same shape of
     * result birdnet-test.js's getTopN() produces (rank/idx/id/sci/com/confidence),
     * plus timing info.
     */
    async identify(audioBlob, options, onProgress) {
      if (!this.isLoaded) {
        throw new Error("BirdNetInference.loadModel() must be called and succeed before identify().");
      }
      const opts = options || {};
      const topN = opts.topN || CONFIG.TOP_N;

      const tDecodeStart = performance.now();
      const { samples, originalSampleRate, originalChannels, duration } = await decodeAndResample(audioBlob, CONFIG.SAMPLE_RATE);
      const decodeMs = performance.now() - tDecodeStart;

      const { maxConfidence, durationMs, numChunks } = await runInference(
        this.session,
        this.labelRows,
        samples,
        CONFIG.SAMPLE_RATE,
        CONFIG.CHUNK_LENGTH_SEC,
        CONFIG.OVERLAP_SEC,
        CONFIG.BATCH_SIZE,
        onProgress
      );

      const results = getTopN(maxConfidence, this.labelRows, topN);

      return {
        topN: results, // raw acoustic Top-N — untouched by Geo/SABAP2/Protected Acoustic
        meta: {
          originalSampleRate,
          originalChannels,
          audioDurationSec: duration,
          targetSampleRate: CONFIG.SAMPLE_RATE,
          chunkLengthSec: CONFIG.CHUNK_LENGTH_SEC,
          overlapSec: CONFIG.OVERLAP_SEC,
          numChunks,
          decodeMs,
          inferenceMs: durationMs,
        },
      };
    }

    // -----------------------------------------------------------------
    // PHASE 2A-STREAMING ADDITIONS BELOW — purely additive. Nothing above
    // this line (loadModel, loadModelFromLocalFiles, identify, and all the
    // module-level helper functions they use) is modified. These new
    // methods exist only because continuous/streaming use needs two
    // capabilities identify() does not expose on its own: (1) resampling
    // already-raw PCM chunks (identify() only accepts a Blob and decodes it
    // itself), and (2) running inference on a single already-prepared
    // window without the multi-chunk max-aggregation identify()/runInference()
    // do internally. Both reuse the exact same underlying techniques
    // (OfflineAudioContext resampling, unmodified raw model output).
    // -----------------------------------------------------------------

    /**
     * Decodes a Blob/File to mono Float32 samples at the audio's ORIGINAL
     * sample rate (no resampling) — used by the continuous-BirdNET test to
     * simulate a live audio stream arriving at its native rate, the same
     * way a live microphone would via BirdRecorder's raw-PCM tap.
     */
    async decodeMono(blob) {
      const arrayBuffer = await blob.arrayBuffer();
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContextClass();
      let buffer;
      try {
        buffer = await ctx.decodeAudioData(arrayBuffer);
      } finally {
        await ctx.close();
      }
      return {
        samples: new Float32Array(buffer.getChannelData(0)),
        sampleRate: buffer.sampleRate,
        duration: buffer.duration,
      };
    }

    /**
     * Resamples a raw Float32 PCM buffer (mono) to another sample rate,
     * using the same OfflineAudioContext technique decodeAndResample() uses
     * internally — just without the decodeAudioData step, since the input
     * here is already raw PCM (e.g. one streamed window), not an encoded file.
     */
    async resamplePcm(samples, sourceSampleRate, targetSampleRate) {
      if (sourceSampleRate === targetSampleRate) return samples;
      if (samples.length === 0) return samples;
      const duration = samples.length / sourceSampleRate;
      const targetLength = Math.max(1, Math.ceil(duration * targetSampleRate));
      const offlineCtx = new OfflineAudioContext(1, targetLength, targetSampleRate);
      const buffer = offlineCtx.createBuffer(1, samples.length, sourceSampleRate);
      if (buffer.copyToChannel) {
        buffer.copyToChannel(samples, 0);
      } else {
        buffer.getChannelData(0).set(samples);
      }
      const sourceNode = offlineCtx.createBufferSource();
      sourceNode.buffer = buffer;
      sourceNode.connect(offlineCtx.destination);
      sourceNode.start(0);
      const rendered = await offlineCtx.startRendering();
      return new Float32Array(rendered.getChannelData(0));
    }

    /**
     * Runs BirdNET V3 on ONE already-32kHz-mono window (no multi-chunk
     * aggregation — a streamed window IS one chunk already). Short windows
     * are zero-padded and long windows truncated to exactly
     * CHUNK_LENGTH_SEC*SAMPLE_RATE samples, matching the zero-padding
     * behaviour runInference() already uses for a recording's trailing
     * short chunk (see planAudioChunks/runInference above) — so short
     * recordings/windows are handled safely, never crash.
     */
    async runSingleWindow(samples32kMono, topN) {
      if (!this.isLoaded) {
        throw new Error("BirdNetInference.loadModel() must be called and succeed before runSingleWindow().");
      }
      const chunkSamples = Math.floor(CONFIG.CHUNK_LENGTH_SEC * CONFIG.SAMPLE_RATE);
      const input = new Float32Array(chunkSamples); // zero-initialized -> zero-padding for short windows
      const toCopy = Math.min(chunkSamples, samples32kMono.length);
      if (toCopy > 0) {
        input.set(samples32kMono.subarray(0, toCopy));
      }

      const tensor = new window.ort.Tensor("float32", input, [1, chunkSamples]);
      const results = await this.session.run({ input: tensor });
      const predTensor = findPredictionTensor(results, this.labelRows.length);
      const predictions = predTensor.data;

      // Single window -> no max-aggregation needed (that's only for
      // combining MULTIPLE chunks in identify()/runInference()). The raw
      // model output for this one window is used directly, unmodified.
      const confidence = new Float32Array(this.labelRows.length);
      for (let c = 0; c < this.labelRows.length; c++) confidence[c] = predictions[c];

      return getTopN(confidence, this.labelRows, topN || CONFIG.TOP_N);
    }
  }

  /** Dev/debug convenience: clears the cached model/labels (e.g. after
   * replacing the files in models/ with a newer version without bumping
   * CONFIG.CACHE_NAME). Not called anywhere automatically. */
  BirdNetInference.clearModelCache = async function () {
    if (typeof caches === "undefined") return false;
    return caches.delete(CONFIG.CACHE_NAME);
  };

  root.BirdNetInference = BirdNetInference;
})(typeof window !== "undefined" ? window : global);
