/**
 * EXPERIMENTAL geographic ranking — shared, environment-agnostic core logic.
 *
 * Used by BOTH the browser test harness (birdnet-test.js, via a <script> tag)
 * and Node-based audit/simulation scripts (tools/simulate_experimental_ranking.js),
 * so the exact same deterministic logic produces the report numbers as would
 * run in the browser — no drift between "what we tested" and "what we report".
 *
 * NOTHING here is a production formula. Every strategy is a labelled,
 * configurable toy calculation for INSPECTING what geographic evidence would
 * do to BirdNET's Top-N order. This module never mutates its inputs.
 */
(function (root) {
  "use strict";

  const COUNTRY_CODES = ["ZA", "NA", "BW", "ZW", "MZ", "ZM", "MW", "LS", "SZ"];

  const DEFAULT_PARAMS = {
    // Heuristics (clearly labelled wherever surfaced, never treated as fact)
    migrantMonthlyRangeThreshold: 15, // percentage points, max-min across 12 SABAP2 months
    rareOverallReprateThreshold: 5,   // percentage points
    geoStrongSupportThreshold: 0.5,   // Geo Model score >= this => "strong geographic support"
    geoUnlikelyThreshold: 0.05,       // Geo Model score < this => "geographic disagreement"
    monthLowValueThreshold: 5,        // percentage points: a non-null, non-zero current-month
                                       // rate below this is reported as "low value", not folded into "value"

    // Score-based strategies
    conservativeMult: 0.02,
    moderateMult: 0.08,

    // Relative rank-evidence strategy
    relativeMaxPositions: 2,

    // Protected Acoustic / Geographic Tie-Breaker strategy
    gapThresholdPct: 10,        // candidates are only considered "close competitors" if their
                                 // ORIGINAL acoustic scores differ by less than this (percentage points)
    minEvidenceDiffToSwap: 1.0, // the trailing (lower-acoustic) candidate must have at least this much
                                 // more total evidence than the leading one before a swap is even considered
    protectionBandCaps: {       // maximum number of positions a candidate may be moved DOWN, by band
      p90: 0,   // acoustic >= 90%: fully protected by default — cannot be pushed down at all
      p80: 1,   // 80-90%: may move down by at most 1 position
      p60: 3,   // 60-80%: may move down by at most 3 positions
      pLow: 10, // <60%: effectively unrestricted within a 20-candidate list
    },
    protectionPasses: 6,        // bounded number of adjacent-swap passes (keeps the algorithm deterministic
                                 // and terminating; real lists converge in far fewer passes than this)

    // "Significant rank change" diagnostic threshold (positions)
    significantThreshold: 3,
  };

  function mergeParams(params) {
    const merged = Object.assign({}, DEFAULT_PARAMS, params || {});
    merged.protectionBandCaps = Object.assign(
      {}, DEFAULT_PARAMS.protectionBandCaps, (params && params.protectionBandCaps) || {}
    );
    return merged;
  }

  function acousticBand(acousticScore) {
    if (acousticScore >= 0.9) return "p90";
    if (acousticScore >= 0.8) return "p80";
    if (acousticScore >= 0.6) return "p60";
    return "pLow";
  }
  function acousticBandLabel(acousticScore) {
    if (acousticScore >= 0.9) return ">=90%";
    if (acousticScore >= 0.8) return "80-90%";
    if (acousticScore >= 0.6) return "60-80%";
    return "<60%";
  }

  /** Distinguishes the FOUR required current-month states — never conflates them. */
  function currentMonthState(rate, params) {
    if (rate === null || rate === undefined) return "NULL";
    if (rate === 0) return "ZERO";
    if (rate < params.monthLowValueThreshold) return "LOW_VALUE";
    return "HIGH_VALUE";
  }

  function isLikelyMigrantHeuristic(e, params) {
    const rates = (e.sabap2 && e.sabap2.monthly_rates || []).filter((v) => v !== null && v !== undefined);
    if (rates.length < 6) return false;
    const max = Math.max(...rates);
    const min = Math.min(...rates);
    return (max - min) >= params.migrantMonthlyRangeThreshold;
  }
  function isRareSpeciesHeuristic(e, params) {
    const r = e.sabap2 && e.sabap2.overall_reprate;
    return r !== null && r !== undefined && r < params.rareOverallReprateThreshold;
  }

  /** Categorical Geo Model evidence label — never phrased as a probability/chance. */
  function geoEvidenceLabel(e, params) {
    if (!e.geo_model.computed) return { value: 0, label: "insufficient geographic evidence (Geo Model not computed)" };
    if (e.geo_model.score >= params.geoStrongSupportThreshold) return { value: 1, label: "strong geographic support" };
    if (e.geo_model.score < params.geoUnlikelyThreshold) return { value: -1, label: "geographic disagreement" };
    return { value: 0.3, label: "weak geographic support" };
  }

  /** Categorical SABAP2 evidence label — never phrased as a probability/chance. */
  function sabapEvidenceLabel(e, params) {
    if (!e.sabap2_match) return { value: 0, label: "no SABAP2 match — no geographic adjustment" };
    const state = currentMonthState(e.sabap2.current_month_rate, params);
    if (state === "NULL") return { value: 0, label: "insufficient SABAP2 data — no adjustment" };
    if (state === "ZERO") return { value: -1, label: "current-month occurrence is 0.0% despite available survey effort (geographic disagreement)" };
    const overall = e.sabap2.overall_reprate;
    if (overall !== null && overall !== undefined && e.sabap2.current_month_rate > overall) {
      return { value: 1, label: "current-month occurrence higher than regional baseline (geographic support)" };
    }
    if (state === "LOW_VALUE") {
      return { value: 0.3, label: "weak geographic support (low but real current-month occurrence)" };
    }
    return { value: 0.5, label: "acoustic result supported by regional occurrence" };
  }

  function computeExperimentalEvidence(e, rawParams) {
    const params = mergeParams(rawParams);
    const geo = geoEvidenceLabel(e, params);
    const sabap = sabapEvidenceLabel(e, params);
    const labels = [geo.label, sabap.label];
    if (isLikelyMigrantHeuristic(e, params)) {
      labels.push("heuristic: possible seasonal migrant (monthly range >= " + params.migrantMonthlyRangeThreshold + "pp) — still allowed to appear");
    }
    if (isRareSpeciesHeuristic(e, params)) {
      labels.push("heuristic: rare regionally (overall reporting rate < " + params.rareOverallReprateThreshold + "%) — still allowed to appear");
    }
    return {
      geoEvidence: geo.value,
      sabapEvidence: sabap.value,
      totalEvidence: geo.value + sabap.value,
      labels,
      monthState: e.sabap2_match ? currentMonthState(e.sabap2.current_month_rate, params) : "N/A",
    };
  }

  /**
   * Runs ONE named strategy. Returns a NEW array (never mutates input).
   * Every strategy guarantees: final ranks are exactly {1..N}, no duplicates,
   * no zero/negative ranks, generated by a single deterministic sort with the
   * ORIGINAL acoustic rank as the explicit final tie-breaker.
   */
  function runExperimentalStrategy(enrichedPredictions, strategyName, rawParams) {
    const params = mergeParams(rawParams);
    const withEvidence = enrichedPredictions.map((e) => ({ e, evidence: computeExperimentalEvidence(e, params) }));

    let ordered;
    if (strategyName === "baseline") {
      ordered = withEvidence.slice().sort((a, b) => (b.e.acoustic_score - a.e.acoustic_score) || (a.e.rank - b.e.rank));
      ordered = ordered.map((item) => ({ ...item, expScore: item.e.acoustic_score }));
    } else if (strategyName === "conservative" || strategyName === "moderate") {
      const mult = strategyName === "conservative" ? params.conservativeMult : params.moderateMult;
      ordered = withEvidence
        .map((item) => ({ ...item, expScore: item.e.acoustic_score + item.evidence.totalEvidence * mult }))
        .sort((a, b) => (b.expScore - a.expScore) || (a.e.rank - b.e.rank)); // original rank = explicit tie-breaker
    } else if (strategyName === "relative") {
      ordered = runRelativeStrategy(withEvidence, params);
    } else if (strategyName === "protected") {
      ordered = runProtectedAcousticStrategy(withEvidence, params);
    } else {
      throw new Error("Unknown experimental strategy: " + strategyName);
    }

    return ordered.map((item, idx) => buildResultRow(item, idx + 1, strategyName, params));
  }

  /**
   * Relative rank evidence — FIXED per audit: computes a single deterministic
   * "priority key" per candidate (not an independent "target rank" that could
   * be misread as a literal final rank), sorts once by that key with the
   * ORIGINAL acoustic rank as the explicit tie-breaker, and only THEN assigns
   * final ranks 1..N from array position. This guarantees no rank 0, no
   * negative ranks, and no duplicate final ranks — those are structurally
   * impossible once ranks come from array index, not from the priority key.
   */
  function runRelativeStrategy(withEvidence, params) {
    return withEvidence
      .map((item) => {
        const evidence = item.evidence.totalEvidence;
        let positions = -Math.sign(evidence) * Math.min(Math.abs(evidence), 1) * params.relativeMaxPositions;
        // Explicit protection: a >=80% acoustic result can only ever be nudged DOWN by 1 position
        // under this strategy, regardless of how negative the evidence is.
        if (item.e.acoustic_score >= 0.8 && positions > 1) positions = 1;
        const priorityKey = item.e.rank + positions; // NOT a literal final rank — a sort key only
        return { ...item, expScore: item.e.acoustic_score, priorityKey };
      })
      .sort((a, b) => (a.priorityKey - b.priorityKey) || (a.e.rank - b.e.rank));
  }

  /**
   * Protected Acoustic / Geographic Tie-Breaker.
   *
   * Philosophy under test: geography should help resolve CLOSE acoustic
   * competitors, not punish a clearly-leading acoustic result. Implemented as
   * a bounded number of adjacent-swap passes over the ORIGINAL acoustic
   * ranking: two neighbours are only ever swapped if (a) their original
   * acoustic scores are within `gapThresholdPct` of each other, (b) the
   * trailing candidate's evidence exceeds the leading one's by at least
   * `minEvidenceDiffToSwap`, and (c) neither candidate's cumulative movement
   * exceeds its acoustic-band's protection cap. This is deterministic,
   * terminates in a bounded number of passes, and can never produce an
   * invalid or duplicate rank (final ranks come from array position only).
   */
  function runProtectedAcousticStrategy(withEvidence, params) {
    let order = withEvidence.slice().sort((a, b) => a.e.rank - b.e.rank);
    const movedDown = new Map(order.map((it) => [it.e.rank, 0]));
    const movedUp = new Map(order.map((it) => [it.e.rank, 0]));

    for (let pass = 0; pass < params.protectionPasses; pass++) {
      let anySwap = false;
      for (let i = 0; i < order.length - 1; i++) {
        const A = order[i]; // currently ahead (better acoustic rank)
        const B = order[i + 1]; // currently behind
        const gapPct = (A.e.acoustic_score - B.e.acoustic_score) * 100;
        if (gapPct > params.gapThresholdPct) continue; // not close competitors — leave acoustic order alone
        const evidenceDiff = B.evidence.totalEvidence - A.evidence.totalEvidence;
        if (evidenceDiff < params.minEvidenceDiffToSwap) continue; // B not meaningfully better supported
        const aCapRemaining = params.protectionBandCaps[acousticBand(A.e.acoustic_score)] - (movedDown.get(A.e.rank) || 0);
        const bCapRemaining = params.protectionBandCaps[acousticBand(B.e.acoustic_score)] - (movedUp.get(B.e.rank) || 0);
        if (aCapRemaining <= 0 || bCapRemaining <= 0) continue; // protection cap reached for one of them
        order[i] = B;
        order[i + 1] = A;
        movedDown.set(A.e.rank, (movedDown.get(A.e.rank) || 0) + 1);
        movedUp.set(B.e.rank, (movedUp.get(B.e.rank) || 0) + 1);
        anySwap = true;
      }
      if (!anySwap) break;
    }
    return order.map((item) => ({ ...item, expScore: item.e.acoustic_score }));
  }

  function buildResultRow(item, experimentalRank, strategyName, params) {
    const originalRank = item.e.rank;
    const rankDelta = experimentalRank - originalRank;
    const flags = [];
    if (Math.abs(rankDelta) >= params.significantThreshold) {
      flags.push(`Moved from #${originalRank} to #${experimentalRank} because of geography`);
    }
    if (originalRank === 1 && experimentalRank !== 1) flags.push("Acoustic Rank #1 displaced");
    if (item.e.acoustic_score > 0.8 && rankDelta > 0) flags.push("Acoustic score > 80% displaced");
    if (item.e.acoustic_score > 0.9 && rankDelta > 0) flags.push("Acoustic score > 90% displaced");
    if (!item.e.sabap2_match && rankDelta < 0) flags.push("Candidate with no SABAP2 data moved upward");
    if (item.e.sabap2_match && item.e.sabap2.current_month_rate === 0 && rankDelta > 0) flags.push("Candidate with SABAP2 = 0.0 moved downward");
    if (isLikelyMigrantHeuristic(item.e, params) && rankDelta > 0) flags.push("Migrant candidate (heuristic) moved downward");
    if (isRareSpeciesHeuristic(item.e, params) && rankDelta > 0) flags.push("Rare species (heuristic) moved downward");

    return {
      strategy: strategyName,
      original_rank: originalRank,
      experimental_rank: experimentalRank,
      rank_delta: rankDelta,
      common_name: item.e.common_name,
      scientific_name: item.e.scientific_name,
      acoustic_score: item.e.acoustic_score,
      acoustic_band: acousticBandLabel(item.e.acoustic_score),
      sabap2: item.e.sabap2,
      sabap2_match: item.e.sabap2_match,
      geo_model: item.e.geo_model,
      allbirds: item.e.allbirds,
      evidence: item.evidence,
      experimental_score: item.expScore,
      diagnostic_flags: flags,
    };
  }

  /**
   * Classifies a single changed candidate's outcome. This is a HEURISTIC
   * interpretation aid for human review only — it never claims a result is
   * "correct". Categories: GOOD, POSSIBLY_GOOD, NEUTRAL, QUESTIONABLE,
   * DANGEROUS. Always paired with a plain-language reason string.
   */
  function classifyOutcome(row, neighbourGapPct) {
    if (row.rank_delta === 0) {
      return { verdict: "NEUTRAL", reason: "No movement." };
    }
    const movedDown = row.rank_delta > 0;
    const acoustic = row.acoustic_score;

    // Highest-severity checks first — a high-confidence result moving down
    // is always at least QUESTIONABLE, regardless of why.
    if (movedDown && acoustic >= 0.9) {
      return { verdict: "DANGEROUS", reason: `A >=90% acoustic candidate (${(acoustic * 100).toFixed(1)}%) was moved down (#${row.original_rank}->#${row.experimental_rank}). This is exactly the scenario the "protect strong acoustic evidence" principle exists to prevent.` };
    }
    if (movedDown && acoustic >= 0.8) {
      return { verdict: "QUESTIONABLE", reason: `An >=80% acoustic candidate was moved down. Worth scrutinising even if the movement was small (Δ${row.rank_delta}).` };
    }

    const gapKnown = neighbourGapPct !== null && neighbourGapPct !== undefined;
    const closeGap = gapKnown && neighbourGapPct <= 5;
    const strongGeoOrSabap = row.evidence.labels.some((l) => l.includes("strong geographic support") || l.includes("higher than regional baseline"));

    if (!movedDown && closeGap && strongGeoOrSabap) {
      return { verdict: "GOOD", reason: `Promoted among genuinely close acoustic competitors (gap ${gapKnown ? neighbourGapPct.toFixed(1) + "pp" : "?"}) with real supporting geographic/seasonal evidence.` };
    }
    if (!movedDown && gapKnown && neighbourGapPct <= 10) {
      return { verdict: "POSSIBLY_GOOD", reason: `Promoted with a moderate acoustic gap (${neighbourGapPct.toFixed(1)}pp) — plausible but less clear-cut than a close tie.` };
    }
    if (movedDown && !row.sabap2_match && !row.geo_model.computed) {
      return { verdict: "NEUTRAL", reason: "Moved down only because a better-supported neighbour was promoted past it — not itself penalised for lacking data." };
    }
    if (movedDown) {
      return { verdict: "QUESTIONABLE", reason: "Moved down under real geographic disagreement — plausible but should be reviewed, especially if the underlying evidence is thin (e.g. a single low SABAP2 value)." };
    }
    return { verdict: "POSSIBLY_GOOD", reason: "Promoted; gap to previous neighbour unknown or large — review individually." };
  }

  /**
   * Runs the Protected strategy across several acoustic-gap thresholds,
   * holding everything else fixed, and returns per-threshold summary
   * statistics — for finding behavioural differences, NOT for picking a
   * final threshold.
   */
  function sweepGapThresholds(enrichedPredictions, thresholds, rawParams) {
    const base = mergeParams(rawParams);
    const out = [];
    for (const gap of thresholds) {
      const params = Object.assign({}, base, { gapThresholdPct: gap });
      const rows = runExperimentalStrategy(enrichedPredictions, "protected", params);
      const check = validateRanking(rows);
      const changed = rows.filter((r) => r.rank_delta !== 0);
      out.push({
        gapThresholdPct: gap,
        valid: check.valid,
        errors: check.errors,
        numSwaps: changed.length, // adjacent swaps roughly correspond 1:1 with changed candidates here
        numRankChanges: changed.length,
        numHighConfidenceDisplaced: changed.filter((r) => r.rank_delta > 0 && r.acoustic_score >= 0.8).length,
        num90Displaced: changed.filter((r) => r.rank_delta > 0 && r.acoustic_score >= 0.9).length,
        numLowConfidenceCorrected: changed.filter((r) => r.rank_delta < 0 && r.acoustic_score < 0.6).length,
        rows,
      });
    }
    return out;
  }

  /** Integrity check, callable from either environment or a test script. */
  function validateRanking(rows) {
    const errors = [];
    const ranks = rows.map((r) => r.experimental_rank);
    const n = rows.length;
    const expected = new Set(Array.from({ length: n }, (_, i) => i + 1));
    const actual = new Set(ranks);
    if (actual.size !== ranks.length) errors.push("Duplicate experimental ranks detected");
    for (const r of ranks) {
      if (!Number.isInteger(r) || r < 1 || r > n) errors.push(`Invalid rank value: ${r}`);
    }
    for (const e of expected) {
      if (!actual.has(e)) errors.push(`Missing expected rank: ${e}`);
    }
    return { valid: errors.length === 0, errors };
  }

  const API = {
    DEFAULT_PARAMS,
    COUNTRY_CODES,
    mergeParams,
    acousticBand,
    acousticBandLabel,
    currentMonthState,
    computeExperimentalEvidence,
    runExperimentalStrategy,
    validateRanking,
    classifyOutcome,
    sweepGapThresholds,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = API;
  } else {
    root.EXP_RANKING_CORE = API;
  }
})(typeof window !== "undefined" ? window : global);
