/**
 * BirdNET Geo Model (Geomodel V3.0.4) — standalone module, PHASE 2B.
 *
 * Direct, unmodified port of the already-tested Geo Model logic in
 * birdnet-test.js (loadGeoModelFromUrls/finishGeoModelLoad, parseGeoLabelsTxt,
 * computeCurrentGeoWeek, buildAcousticToGeoMap, runGeoInference). This module
 * does not retrain, replace, or alter that model or its input convention in
 * any way — it only reorganizes the same logic into a reusable class for
 * identify.html, matching the pattern already established for
 * birdnet-inference.js/birdnet-streaming.js (self-contained, no coupling to
 * BirdAudioAnalyzer/BirdRecorder or to the acoustic model's own code).
 *
 * CRITICAL SAFETY RULE (Phase 2B, Part 6): Geo evidence is ADDITIVE ONLY.
 * Nothing in this module ever deletes, hides, or reorders a BirdNET
 * candidate. A low or missing Geo score is evidence, never rejection. This
 * module has no method that filters or reorders anything — it only computes
 * a score (or reports "not computed") for a given species/location/week.
 */
(function (root) {
  "use strict";

  const CONFIG = {
    // GitHub raw already sends permissive CORS headers for this project's
    // origin (confirmed in birdnet-test.js — unlike Zenodo for the acoustic
    // model), so no same-origin hosting or local-file fallback is required
    // here. Same official assets as birdnet-test.js.
    GEO_MODEL_URL: "https://raw.githubusercontent.com/birdnet-team/geomodel/main/docs/demo/geomodel_fp16.onnx",
    GEO_LABELS_URL: "https://raw.githubusercontent.com/birdnet-team/geomodel/main/docs/demo/labels.txt",
    ORT_VERSION: "1.26.0",
    WEEKS_PER_YEAR: 48,
    CACHE_NAME: "birdnet-geo-model-cache-v1",
  };

  let ortLoadingPromise = null;
  function ensureOrtLoaded() {
    if (typeof window.ort !== "undefined") return Promise.resolve();
    if (ortLoadingPromise) return ortLoadingPromise;
    ortLoadingPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${CONFIG.ORT_VERSION}/dist/ort.min.js`;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load onnxruntime-web from CDN."));
      document.head.appendChild(script);
    });
    return ortLoadingPromise;
  }

  /** Same Cache Storage pattern as birdnet-inference.js — falls back to a
   * plain fetch if Cache Storage is unavailable; caching is a performance
   * optimization only, never a correctness requirement. */
  async function fetchWithCache(url) {
    if (typeof caches === "undefined") {
      return { response: await fetch(url), fromCache: false };
    }
    try {
      const cache = await caches.open(CONFIG.CACHE_NAME);
      const cached = await cache.match(url);
      if (cached) return { response: cached, fromCache: true };
      const response = await fetch(url);
      if (response.ok) {
        cache.put(url, response.clone()).catch((err) => console.warn("[BirdNetGeoModel] cache write failed:", err));
      }
      return { response, fromCache: false };
    } catch (err) {
      console.warn("[BirdNetGeoModel] Cache Storage unavailable, falling back to plain fetch:", err);
      return { response: await fetch(url), fromCache: false };
    }
  }

  // Direct port of birdnet-test.js parseGeoLabelsTxt().
  function parseGeoLabelsTxt(text) {
    const lines = text.trim().split(/\r?\n/);
    return lines.map((line, i) => {
      const parts = line.split("\t");
      return {
        key: parts[0] || "",
        sci: (parts[1] || "").trim(),
        common: (parts[2] || parts[1] || "").trim(),
        index: i,
      };
    });
  }

  /**
   * Direct port of birdnet-test.js computeCurrentGeoWeek(). BirdNET Geomodel
   * uses 48 "weeks" per year (4 fixed-length periods per calendar month),
   * NOT ISO calendar weeks.
   */
  function computeCurrentGeoWeek(date) {
    const now = date || new Date();
    const month = now.getMonth(); // 0-11
    const dayOfMonth = now.getDate(); // 1-31
    const period = Math.min(3, Math.floor((dayOfMonth - 1) / 7.75)); // 0-3
    return month * 4 + period + 1; // 1-48
  }

  class BirdNetGeoModel {
    constructor() {
      this.session = null;
      this.labelRows = [];
      this.isLoaded = false;
      this.acousticToGeoIndex = null; // Int32Array, built by buildAcousticMap()
      this.acousticMapStats = null; // { matched, total }
    }

    async loadModel(onStatus) {
      const status = onStatus || (() => {});
      status("Loading ONNX Runtime Web…");
      await ensureOrtLoaded();

      status("Downloading Geo Model…");
      const tStart = performance.now();
      const { response: modelResp, fromCache: modelFromCache } = await fetchWithCache(CONFIG.GEO_MODEL_URL);
      if (!modelResp.ok) {
        throw new Error(`Geo model fetch failed with HTTP ${modelResp.status}.`);
      }
      status(modelFromCache ? "Loading Geo Model from browser cache…" : "Downloading Geo Model (first time only, ~7.5MB)…");
      const modelBuffer = await modelResp.arrayBuffer();

      const { response: labelsResp, fromCache: labelsFromCache } = await fetchWithCache(CONFIG.GEO_LABELS_URL);
      if (!labelsResp.ok) {
        throw new Error(`Geo labels fetch failed with HTTP ${labelsResp.status}.`);
      }
      status(labelsFromCache ? "Loading Geo labels from browser cache…" : "Downloading Geo labels…");
      const labelsText = await labelsResp.text();

      const rows = parseGeoLabelsTxt(labelsText);
      if (!rows.length) {
        throw new Error("Geo labels file parsed to zero rows.");
      }

      status("Initializing Geo Model ONNX Runtime Web session (WASM)…");
      this.session = await window.ort.InferenceSession.create(new Uint8Array(modelBuffer), {
        executionProviders: ["wasm"],
      });
      this.labelRows = rows;
      this.isLoaded = true;
      status("Geo Model ready.");
      return { loadMs: performance.now() - tStart, labelCount: rows.length };
    }

    /**
     * Builds the join between the BirdNET acoustic model's label rows
     * (passed in — this module never reads birdnet-inference.js's internals
     * directly, it only accepts the same labelRows array as plain data) and
     * this Geo model's own label rows, by EXACT scientific-name match — the
     * one field both label sets share in directly comparable form. Same
     * approach as birdnet-test.js buildAcousticToGeoMap(). Species that
     * don't match are simply -1 (unmatched), never guessed.
     */
    buildAcousticMap(acousticLabelRows) {
      const geoByName = new Map();
      for (const g of this.labelRows) {
        const key = (g.sci || "").trim().toLowerCase();
        if (key) geoByName.set(key, g.index);
      }
      const map = new Int32Array(acousticLabelRows.length).fill(-1);
      let matched = 0;
      for (let i = 0; i < acousticLabelRows.length; i++) {
        const key = (acousticLabelRows[i].sci || "").trim().toLowerCase();
        if (key && geoByName.has(key)) {
          map[i] = geoByName.get(key);
          matched++;
        }
      }
      this.acousticToGeoIndex = map;
      this.acousticMapStats = { matched, total: acousticLabelRows.length };
      return this.acousticMapStats;
    }

    /**
     * Runs the Geo model for a single (lat, lon, week) point. Direct port of
     * birdnet-test.js runGeoInference() — tensor shape [1,3], input order
     * [lat, lon, week], raw sigmoid-probability output used directly (no
     * further transform, no threshold applied here — thresholding/labelling
     * for display is the CALLER's job, this function only returns evidence).
     */
    async runInference(lat, lon, week) {
      if (!this.isLoaded) {
        throw new Error("BirdNetGeoModel.loadModel() must be called and succeed before runInference().");
      }
      const inputData = new Float32Array([lat, lon, week]);
      const tensor = new window.ort.Tensor("float32", inputData, [1, 3]);
      const feeds = {};
      feeds[this.session.inputNames[0]] = tensor;
      const results = await this.session.run(feeds);
      const outKey = Object.keys(results)[0];
      const probs = new Float32Array(results[outKey].data);
      return probs; // indexed by THIS module's own labelRows[i].index
    }

    /** Looks up the Geo score for one acoustic-model label index, given a
     * probs array from runInference(). Returns null (not -1/0) if there is
     * no scientific-name match — "no data", never "zero/unlikely". */
    scoreForAcousticIndex(acousticIdx, probs) {
      if (!this.acousticToGeoIndex || !probs) return null;
      const geoIdx = this.acousticToGeoIndex[acousticIdx];
      if (geoIdx === undefined || geoIdx < 0) return null;
      return probs[geoIdx];
    }
  }

  root.BirdNetGeoModel = BirdNetGeoModel;
  root.computeCurrentGeoWeek = computeCurrentGeoWeek;
})(typeof window !== "undefined" ? window : global);
