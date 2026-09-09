/**
 * Continuous / streaming BirdNET V3 support — standalone module.
 *
 * Builds on top of birdnet-inference.js's already-proven Phase 2A engine
 * (BirdNetInference) WITHOUT modifying it. This module owns only the
 * orchestration of continuous audio windows arriving over time (live
 * microphone OR a simulated progressive feed of an existing recording):
 *
 *   audio arrives in small chunks
 *     -> accumulated into a rolling buffer
 *       -> sliced into non-overlapping ~3s windows as they become available
 *         -> each window queued (bounded, with backpressure) for inference
 *           -> BirdNetInference.resamplePcm() + runSingleWindow()
 *             -> raw acoustic Top-N for that window, unmodified
 *               -> onWindowResult callback (caller decides what to do with it)
 *
 * NO Geo Model, SABAP2, or Protected Acoustic logic exists here — this
 * module only proves that continuous windowing + queued inference works.
 * The raw Top-N passed to onWindowResult is exactly what
 * BirdNetInference.runSingleWindow() returns, untouched.
 */
(function (root) {
  "use strict";

  /**
   * Slices a continuous audio stream into fixed-length windows and runs
   * each one through a BirdNetInference engine, one at a time, with a
   * bounded queue (oldest-not-yet-started window is dropped if the queue
   * is full) so inference can never fall further and further behind if it
   * is slower than the audio arrival rate — this is deliberate backpressure,
   * not a bug: a live stream must never grow an unbounded queue/memory use.
   */
  class ContinuousBirdNetProcessor {
    constructor(birdNetEngine, options) {
      const opts = options || {};
      this.engine = birdNetEngine;
      this.windowSec = opts.windowSec || 3; // matches BirdNET's own 3s window
      this.strideSec = opts.strideSec || this.windowSec; // default preserves non-overlapping production windows
      this.maxQueueSize = opts.maxQueueSize || 2; // backpressure cap
      this.topNPerWindow = opts.topNPerWindow || 5;

      // Callbacks — all optional.
      this.onWindowResult = null;  // (topN, windowInfo) => {}
      this.onWindowDropped = null; // (windowInfo) => {}
      this.onError = null;         // (error, windowInfo) => {}

      this._buffer = new Float32Array(0);
      this._bufferSampleRate = null;
      this._queue = [];
      this._processing = false;
      this._stopped = false;
      this._windowIndex = 0;
    }

    /**
     * Feeds a new chunk of raw audio samples (mono Float32, at `sampleRate`)
     * into the processor. Safe to call repeatedly as small chunks arrive
     * (e.g. every ~4096 samples from a live microphone tap, or a simulated
     * stream of an existing recording). Internally accumulates samples and
     * emits complete windows as soon as enough audio has arrived; leftover
     * partial audio stays buffered for the next call.
     */
    feedAudioStream(samples, sampleRate) {
      if (this._stopped || !samples || !samples.length) return;

      if (this._bufferSampleRate === null) {
        this._bufferSampleRate = sampleRate;
      } else if (sampleRate !== this._bufferSampleRate) {
        // Sample rate should not change mid-stream in practice; guard
        // defensively rather than silently mixing rates.
        console.warn("[ContinuousBirdNetProcessor] sample rate changed mid-stream (" +
          this._bufferSampleRate + " -> " + sampleRate + "); resetting buffer.");
        this._buffer = new Float32Array(0);
        this._bufferSampleRate = sampleRate;
      }

      const merged = new Float32Array(this._buffer.length + samples.length);
      merged.set(this._buffer, 0);
      merged.set(samples, this._buffer.length);
      this._buffer = merged;

      const windowSamples = Math.floor(this.windowSec * this._bufferSampleRate);
      const strideSamples = Math.floor(this.strideSec * this._bufferSampleRate);
      while (this._buffer.length >= windowSamples) {
        const windowData = this._buffer.slice(0, windowSamples);
        this._buffer = this._buffer.slice(strideSamples);
        this._enqueueWindow(windowData, this._bufferSampleRate);
      }
    }

    /**
     * Flushes any leftover partial window (shorter than windowSec) as a
     * final, short window — handled safely (zero-padded) by
     * BirdNetInference.runSingleWindow(), never crashes. Call this once,
     * e.g. when the user presses Stop, after the last feedAudioStream() call.
     */
    flush() {
      if (this._stopped) return;
      if (this._buffer.length > 0 && this._bufferSampleRate) {
        this._enqueueWindow(this._buffer, this._bufferSampleRate);
        this._buffer = new Float32Array(0);
      }
    }

    _enqueueWindow(samples, sampleRate) {
      if (this._stopped) return;
      const windowInfo = {
        windowIndex: this._windowIndex++,
        sampleRate,
        numSamples: samples.length,
        windowDurationSec: samples.length / sampleRate,
        windowStrideSec: this.strideSec,
        windowStartSec: (this._windowIndex - 1) * this.strideSec,
        windowEndSec: (this._windowIndex - 1) * this.strideSec + this.windowSec,
        queuedAt: Date.now(),
      };

      if (this._queue.length >= this.maxQueueSize) {
        // Backpressure: inference is falling behind the audio arrival rate.
        // Drop the OLDEST still-queued (not yet started) window rather than
        // letting the queue — and memory use — grow without bound.
        const dropped = this._queue.shift();
        if (this.onWindowDropped) this.onWindowDropped(dropped.windowInfo);
        console.warn("[ContinuousBirdNetProcessor] backpressure: dropped window", dropped.windowInfo.windowIndex);
      }

      this._queue.push({ samples, windowInfo });
      this._processQueue(); // no-op if already processing — see guard below
    }

    async _processQueue() {
      if (this._processing) return; // exactly one inference in flight at a time
      this._processing = true;
      try {
        while (this._queue.length > 0 && !this._stopped) {
          const { samples, windowInfo } = this._queue.shift();
          try {
            const resampled = await this.engine.resamplePcm(samples, windowInfo.sampleRate, 32000);
            const topN = await this.engine.runSingleWindow(resampled, this.topNPerWindow);
            if (!this._stopped && this.onWindowResult) this.onWindowResult(topN, windowInfo);
          } catch (err) {
            console.error("[ContinuousBirdNetProcessor] window inference failed:", err);
            if (this.onError) this.onError(err, windowInfo);
          }
        }
      } finally {
        this._processing = false;
      }
    }

    /**
     * Stops accepting new audio/windows immediately. Clears the queue of
     * any windows that had not yet started inference (they are simply
     * discarded, not processed) and discards any buffered partial audio.
     * Any single window whose inference was ALREADY in flight when stop()
     * was called is allowed to finish naturally (its result callback may
     * still fire once), but the processing loop then exits cleanly because
     * the queue is empty and _stopped is set.
     */
    stop() {
      this._stopped = true;
      this._queue = [];
      this._buffer = new Float32Array(0);
    }
  }

  /**
   * Accumulates per-window detections into a simple "have I heard this bird
   * before, and how many times" list — kept ENTIRELY separate from the raw
   * per-window Top-N predictions, which are never modified or stored here.
   *
   * Current simple rule (Phase 2A-streaming only, deliberately not a final
   * ranking policy — that is Phase 2C's job): each window's OWN top-ranked
   * raw prediction is treated as "the detection for that window". This is a
   * placeholder aggregation rule, not a geographic/evidence-based ranking.
   */
  class BirdDetectionAccumulator {
    constructor() {
      this.detections = new Map(); // key: scientific name (or idx) -> record
    }

    /**
     * Feeds one window's Top-N (raw, unmodified) into the accumulator.
     * Uses topN[0] (the window's top raw prediction) as "the detection" for
     * that window, per the simple rule documented above.
     *
     * PHASE 2B ADDITION (backward compatible): an optional third argument,
     * `evidence`, may carry a { geo_model, sabap2 } enrichment object for
     * this same top candidate (see southern-africa-occurrence.js
     * enrichPrediction() / birdnet-geo.js) — e.g. from identify.html. When
     * omitted (as all existing callers/tests already do), behaviour is
     * IDENTICAL to before this addition: no geo_model/sabap2 fields are
     * added to the record at all. This never affects latestScore, bestScore,
     * detectionCount, or timestamps — those remain acoustic-only.
     */
    addWindowResult(topN, windowInfo, evidence) {
      if (!topN || !topN.length) return null;
      const top = topN[0];
      const key = top.sci || String(top.idx);
      const now = (windowInfo && windowInfo.queuedAt) || Date.now();

      let rec = this.detections.get(key);
      if (!rec) {
        rec = {
          idx: top.idx,
          sci: top.sci,
          com: top.com,
          latestScore: top.confidence,
          bestScore: top.confidence,
          detectionCount: 1,
          firstDetectedAt: now,
          lastDetectedAt: now,
        };
        this.detections.set(key, rec);
      } else {
        rec.latestScore = top.confidence;
        rec.bestScore = Math.max(rec.bestScore, top.confidence);
        rec.detectionCount += 1;
        rec.lastDetectedAt = now;
      }
      // Additive only — only touched when a caller actually supplies
      // evidence. Always the LATEST evidence for this species (geography/
      // occurrence context for "right now", not accumulated/averaged).
      if (evidence) {
        if (evidence.geo_model) rec.geo_model = evidence.geo_model;
        if (evidence.sabap2) rec.sabap2 = evidence.sabap2;
      }
      return rec;
    }

    getAll() {
      return Array.from(this.detections.values());
    }

    reset() {
      this.detections.clear();
    }
  }

  root.ContinuousBirdNetProcessor = ContinuousBirdNetProcessor;
  root.BirdDetectionAccumulator = BirdDetectionAccumulator;
})(typeof window !== "undefined" ? window : global);
