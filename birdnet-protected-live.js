/**
 * PHASE 2C — Protected Acoustic integration for the LIVE BirdDetectionAccumulator.
 *
 * This module does NOT implement a ranking algorithm. It only:
 *   1. Takes a snapshot of BirdDetectionAccumulator records (from
 *      birdnet-streaming.js — untouched by this module).
 *   2. Assigns a "raw acoustic rank" to that snapshot by sorting on
 *      latestScore descending (the same "rank by confidence" convention
 *      birdnet-inference.js's getTopN() already uses for a single
 *      recording's Top-N — applied here to the live, evolving detection
 *      list, since there is no other well-defined "Top-N" for a live feed).
 *   3. Calls the EXISTING, UNMODIFIED EXP_RANKING_CORE.runExperimentalStrategy(
 *      ..., "protected", {}) from experimental-ranking-core.js — the
 *      project's source of truth for Protected Acoustic. No new ranking
 *      algorithm is invented here.
 *   4. Calls the EXISTING, UNMODIFIED EXP_RANKING_CORE.validateRanking().
 *      If validation ever fails, or the strategy throws, this module FAILS
 *      SAFE: it returns the raw acoustic order, flagged usedFallback: true,
 *      and never surfaces a broken ranking.
 *   5. Returns rows in FINAL DISPLAY ORDER, each carrying a reference to the
 *      ORIGINAL, untouched accumulator record (`record`) — Latest/Best/Heard/
 *      scientific name/common name/BirdNET ID are read from that original
 *      record only, never copied/recomputed/altered by this module. Ranking
 *      determines DISPLAY ORDER only.
 *
 * Never mutates the accumulator records passed in. Never touches
 * birdnet-inference.js, birdnet-geo.js, or southern-africa-occurrence.js.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("./experimental-ranking-core.js"));
  } else {
    root.BirdNetProtectedLive = factory(root.EXP_RANKING_CORE);
  }
})(typeof window !== "undefined" ? window : global, function (EXP_RANKING_CORE) {
  "use strict";

  /** Builds the exact enriched-prediction shape experimental-ranking-core.js
   * expects (see computeExperimentalEvidence/buildResultRow), from one
   * accumulator record + its assigned raw rank. Never mutates `rec`. */
  function toEnrichedPrediction(rec, rawRank) {
    return {
      rank: rawRank,
      common_name: rec.com,
      scientific_name: rec.sci,
      acoustic_score: rec.latestScore,
      sabap2_match: !!(rec.sabap2 && rec.sabap2.found),
      sabap2: rec.sabap2 || { found: false, current_month_rate: null, overall_reprate: null, monthly_rates: null },
      geo_model: rec.geo_model || { computed: false, score: null, reason_not_computed: "not_computed" },
      allbirds: rec.allbirds,
      _origRecord: rec, // internal only — stripped before results leave this module
    };
  }

  /**
   * @param records  Array as returned by BirdDetectionAccumulator.getAll() —
   *                  NEVER mutated.
   * @param rawParams Optional override params, passed straight through to
   *                  EXP_RANKING_CORE (defaults already match the
   *                  already-validated production defaults exactly).
   * @returns {
   *   rows: [{ record, raw_rank, protected_rank, rank_delta, acoustic_score,
   *            geo_model, sabap2, evidence_labels, used_fallback }, ...]
   *          in FINAL DISPLAY ORDER (protected_rank ascending),
   *   validation: { valid, errors },
   *   usedFallback: boolean,
   *   candidateCountBefore / candidateCountAfter: for integration checks.
   * }
   */
  function rankAccumulatorRecords(records, rawParams) {
    const candidateCountBefore = records ? records.length : 0;
    if (!records || !records.length) {
      return { rows: [], validation: { valid: true, errors: [] }, usedFallback: false, candidateCountBefore, candidateCountAfter: 0 };
    }

    // Step 1: raw acoustic order for THIS snapshot (by current confidence).
    const rawSorted = records.slice().sort((a, b) => b.latestScore - a.latestScore);
    const enriched = rawSorted.map((rec, i) => toEnrichedPrediction(rec, i + 1));

    const fallback = () => {
      const rows = enriched.map((e, i) => ({
        record: e._origRecord,
        raw_rank: i + 1,
        protected_rank: i + 1,
        rank_delta: 0,
        acoustic_score: e.acoustic_score,
        geo_model: e.geo_model,
        sabap2: e.sabap2,
        evidence_labels: [],
        used_fallback: true,
      }));
      return { rows, validation: { valid: false, errors: ["fallback used"] }, usedFallback: true, candidateCountBefore, candidateCountAfter: rows.length };
    };

    // Step 2/3: run the EXISTING, UNMODIFIED Protected Acoustic strategy.
    let resultRows, validation;
    try {
      resultRows = EXP_RANKING_CORE.runExperimentalStrategy(enriched, "protected", rawParams || {});
      validation = EXP_RANKING_CORE.validateRanking(resultRows);
    } catch (err) {
      console.error("[BirdNetProtectedLive] Protected Acoustic threw — failing safe to raw acoustic order:", err);
      return fallback();
    }

    if (!validation.valid) {
      console.error("[BirdNetProtectedLive] validateRanking() failed — failing safe to raw acoustic order:", validation.errors);
      return fallback();
    }

    // Step 4: candidate-count integrity check (Part H) — fail safe too.
    if (resultRows.length !== enriched.length) {
      console.error("[BirdNetProtectedLive] candidate count changed by ranking — failing safe.", enriched.length, "->", resultRows.length);
      return fallback();
    }

    // Step 5: map back to ORIGINAL records; ranking determines ORDER only.
    const bySci = new Map(enriched.map((e) => [e.scientific_name, e]));
    const rows = resultRows
      .slice()
      .sort((a, b) => a.experimental_rank - b.experimental_rank)
      .map((r) => {
        const e = bySci.get(r.scientific_name);
        return {
          record: e._origRecord, // ORIGINAL accumulator record — untouched
          raw_rank: r.original_rank,
          protected_rank: r.experimental_rank,
          rank_delta: r.rank_delta,
          acoustic_score: r.acoustic_score,
          geo_model: r.geo_model,
          sabap2: r.sabap2,
          evidence_labels: r.evidence.labels,
          used_fallback: false,
        };
      });

    return { rows, validation, usedFallback: false, candidateCountBefore, candidateCountAfter: rows.length };
  }

  return { rankAccumulatorRecords };
});
