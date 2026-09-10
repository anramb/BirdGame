/**
 * Southern Africa occurrence data layer — loader + lookup + enrichment.
 *
 * Loads the pre-generated, bundled data/southern_africa_occurrence.json
 * (built offline by tools/build_southern_africa_occurrence.py from SABAP2 +
 * BirdNET taxonomy + BirdNET acoustic labels — see that script for the full
 * generation/validation process). This module ONLY reads that static file
 * at runtime; it never calls the SABAP2 API and never re-derives the data.
 *
 * This is a diagnostic/enrichment layer only. It NEVER modifies, reorders,
 * or filters BirdNET's raw acoustic predictions — see enrichPrediction()
 * below, which always returns the original prediction fields untouched
 * plus additional, clearly-separated context objects.
 */

const SA_OCCURRENCE = (function () {
  "use strict";

  const DEFAULT_URL = "data/southern_africa_occurrence.json";
  const COUNTRY_CODES = ["ZA", "NA", "BW", "ZW", "MZ", "ZM", "MW", "LS", "SZ"];
  const REGION_RECOVERY_SCIENTIFIC_NAMES = new Set([
    "anthropoides paradiseus",
    "charadrius tricollaris",
    "granatina granatina",
    "milvus aegyptius",
    "notopholia corusca",
    "phalacrocorax lucidus",
    "upupa africana",
    "camaroptera brevicauda",
  ]);
  const REGION_TAXONOMY_REVIEW_SCIENTIFIC_NAMES = new Set([
    "apalis fuscigularis",
    "pycnonotus barbatus",
  ]);

  function buildRegionMembership(prediction, record) {
    const taxonomicClass = String(prediction.taxonomic_class || "").trim();
    if (taxonomicClass && taxonomicClass !== "Aves") {
      return {
        state: "NON_BIRD",
        source: "birdnet_label_class",
        taxonomy_review: false,
      };
    }
    const scientificName = norm(prediction.scientific_name);
    if (record && record.regional_occurrence === true) {
      return {
        state: "REGION_CONFIRMED",
        source: "southern_africa_9_country_universe",
        taxonomy_review: false,
      };
    }
    if (REGION_RECOVERY_SCIENTIFIC_NAMES.has(scientificName)) {
      return {
        state: "REGION_CONFIRMED",
        source: "southern_africa_9_country_universe_taxonomy_recovery",
        taxonomy_review: true,
      };
    }
    if (REGION_TAXONOMY_REVIEW_SCIENTIFIC_NAMES.has(scientificName)) {
      return {
        state: "REGION_TAXONOMY_REVIEW",
        source: "southern_africa_9_country_universe_taxonomy_review",
        taxonomy_review: true,
      };
    }
    return {
      state: "REGION_UNRESOLVED",
      source: "not_in_current_southern_africa_universe",
      taxonomy_review: false,
    };
  }

  let state = {
    loaded: false,
    loading: false,
    error: null,
    metadata: null,
    count: 0,
    byScientificName: null, // Map<normalized sci name, record>
    byBirdNetId: null,      // Map<birdnet_id, record>
  };

  function norm(s) {
    return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  /**
   * Loads and indexes the dataset exactly once. Safe to call multiple
   * times — subsequent calls return the same cached, already-resolved
   * promise/result. Never throws: on failure it resolves with
   * { loaded: false, error } so BirdNET identification can continue
   * unaffected (see README notes in the calling code / Part 19 of the spec).
   */
  async function load(url) {
    if (state.loaded || state.loading) return state;
    state.loading = true;
    try {
      const resp = await fetch(url || DEFAULT_URL);
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} loading ${url || DEFAULT_URL}`);
      }
      const data = await resp.json();
      const byScientificName = new Map();
      const byBirdNetId = new Map();
      for (const rec of data.species || []) {
        byScientificName.set(norm(rec.scientific_name), rec);
        byBirdNetId.set(rec.birdnet_id, rec);
      }
      state = {
        loaded: true,
        loading: false,
        error: null,
        metadata: data.metadata || null,
        count: (data.species || []).length,
        byScientificName,
        byBirdNetId,
      };
    } catch (err) {
      console.warn("[SA_OCCURRENCE] Failed to load dataset — geographic enrichment will be unavailable, "
        + "but BirdNET identification is unaffected:", err);
      state.loading = false;
      state.loaded = false;
      state.error = err.message || String(err);
    }
    return state;
  }

  function getState() {
    return state;
  }

  /** O(1) lookup by BirdNET ID (preferred when reliably available). */
  function lookupByBirdNetId(birdnetId) {
    if (!state.loaded || !birdnetId) return null;
    return state.byBirdNetId.get(birdnetId) || null;
  }

  /** O(1) lookup by scientific name (fallback / primary runtime key). */
  function lookupByScientificName(sciName) {
    if (!state.loaded || !sciName) return null;
    return state.byScientificName.get(norm(sciName)) || null;
  }

  /**
   * Calendar month index (1-12, Jan=1) for SABAP2's monthly_rate_01..12
   * fields. NOTE: this is a DIFFERENT time system from BirdNET Geo Model's
   * 48-weeks-per-year convention (see birdnet-test.js computeCurrentGeoWeek)
   * — the two must never be conflated.
   */
  function getCurrentCalendarMonth(date) {
    return (date || new Date()).getMonth() + 1;
  }

  /**
   * Builds the sabap2 enrichment sub-object for a single prediction.
   * Null is preserved exactly as stored (never coerced to 0 or to a
   * boolean) — see Part 8 of the spec.
   */
  function buildSabap2Block(record, calendarMonth) {
    if (!record) {
      return {
        found: false,
        regional_occurrence: null,
        country_rates: null,
        monthly_rates: null,
        current_month_rate: null,
        overall_reprate: null,
        current_acoustic_model_support: null,
      };
    }
    const country_rates = {};
    for (const code of COUNTRY_CODES) {
      country_rates[code] = record[`country_${code}`] ?? null;
    }
    const monthly_rates = [];
    for (let i = 1; i <= 12; i++) {
      monthly_rates.push(record[`monthly_rate_${String(i).padStart(2, "0")}`] ?? null);
    }
    const monthKey = `monthly_rate_${String(calendarMonth).padStart(2, "0")}`;
    const province_data = record.province_data || {};
    const sa_provinces_found = Object.keys(province_data);
    const gauteng = province_data.GP || null;
    let strongest_sa_province = null;
    for (const [code, province] of Object.entries(province_data)) {
      if (province.overall_reprate === null || province.overall_reprate === undefined) continue;
      if (!strongest_sa_province || province.overall_reprate > strongest_sa_province.overall_reprate) {
        strongest_sa_province = {
          code,
          overall_reprate: province.overall_reprate,
          records: province.records,
          cards: province.cards,
        };
      }
    }
    return {
      found: true,
      regional_occurrence: record.regional_occurrence ?? null,
      country_rates,
      monthly_rates,
      current_month_rate: record[monthKey] ?? null,
      overall_reprate: record.overall_reprate ?? null,
      current_acoustic_model_support: record.current_acoustic_model_support ?? null,
      province_data,
      gauteng_found: !!gauteng,
      gauteng_recrate: gauteng ? gauteng.overall_reprate : null,
      gauteng_records: gauteng ? gauteng.records : null,
      gauteng_cards: gauteng ? gauteng.cards : null,
      gauteng_current_month_rate: gauteng ? (gauteng.monthly_rates[calendarMonth - 1] ?? null) : null,
      sa_provinces_found,
      sa_province_count: sa_provinces_found.length,
      strongest_sa_province,
      match_type: record.match_type || null,
      sabap2_spp_code: record.sabap2_spp_code ?? null,
    };
  }

  /**
   * allbirds.js stores English names "group-word-first" (e.g.
   * "Kingfisher Brown-hooded", "Cisticola Chirping") rather than standard
   * English order ("Brown-hooded Kingfisher"). This is NOT new — learn.html
   * already solves the exact same problem for its own search box via a
   * word-rotation trick (see getSearchKeys() in learn.html). This reuses
   * that same idea (never modifies allbirds.js) so BirdNET's standard-order
   * common names can still match allbirds' group-first convention.
   *
   * learn.html rotates LEFT by one word to turn a stored group-first name
   * into standard order (for its search box). Here we go the other
   * direction: given BirdNET's standard-order name, rotate RIGHT by one
   * word (move the last word to the front) to reproduce allbirds'
   * group-first convention, and compare both the literal and rotated
   * spaceless forms.
   */
  function spacelessNameKeys(name) {
    if (!name) return [];
    const lower = name.toLowerCase();
    const noSpaces = lower.replace(/\s+/g, "");
    const words = lower.split(/\s+/);
    if (words.length <= 1) return [noSpaces];
    const rotatedRight = [words[words.length - 1], ...words.slice(0, -1)].join("");
    return [noSpaces, rotatedRight];
  }

  /**
   * Best-effort content-availability check against allbirds.js.
   *
   * IMPORTANT LIMITATION (documented, not hidden): allbirds.js currently has
   * NO scientific_name field, so — unlike the strict scientific-name-based
   * SABAP2 join — this can only match by common (English) name, and is
   * therefore a lower-stakes, content-only lookup (does OUR app have
   * audio/photos for this species), not a taxonomic or geographic join.
   * Adding a scientific_name field to allbirds.js would make this more
   * robust, but that is a production-data change out of scope here — see
   * the accompanying report for that recommendation.
   */
  function lookupAllbirdsByCommonName(commonName) {
    if (typeof allbirds === "undefined" || !Array.isArray(allbirds) || !commonName) {
      return { found: false, entry: null, reason: "allbirds.js not loaded or empty" };
    }
    const queryKeys = spacelessNameKeys(commonName);
    const entry = allbirds.find((b) => {
      if (!b || !b.english) return false;
      const bKeys = spacelessNameKeys(b.english);
      return queryKeys.some((qk) => bKeys.includes(qk));
    });
    if (entry) {
      return { found: true, entry: { english: entry.english, afrikaans: entry.afrikaans, audio: entry.audio || null, image: entry.image || null } };
    }
    return { found: false, entry: null };
  }

  /**
   * Enriches a single raw BirdNET prediction with SABAP2 + (optional) Geo
   * Model + allbirds.js context. NEVER mutates the input prediction object;
   * always returns a NEW object so raw_predictions stays untouched
   * (Part 16 of the spec).
   *
   * @param prediction {rank, scientific_name, common_name, birdnet_id, idx, acoustic_score}
   * @param opts {calendarMonth, geoModelScore, geoModelComputed, geoModelReasonNotComputed}
   */
  function enrichPrediction(prediction, opts) {
    opts = opts || {};
    const calendarMonth = opts.calendarMonth || getCurrentCalendarMonth();

    // Prefer BirdNET ID (Part 18); fall back to scientific name.
    let record = null;
    let lookupMethod = null;
    if (prediction.birdnet_id) {
      record = lookupByBirdNetId(prediction.birdnet_id);
      if (record) lookupMethod = "birdnet_id";
    }
    if (!record && prediction.scientific_name) {
      record = lookupByScientificName(prediction.scientific_name);
      if (record) lookupMethod = "scientific_name";
    }

    const sabap2 = buildSabap2Block(record, calendarMonth);
    const region_membership = buildRegionMembership(prediction, record);

    // A species that BirdNET JUST predicted is, by definition, acoustically
    // supported right now — independent of whether the SABAP2/taxonomy join
    // itself is aware of that fact for the *taxonomy-side* record.
    if (sabap2.current_acoustic_model_support === null) {
      sabap2.current_acoustic_model_support = true;
    }

    const geo_model = {
      computed: !!opts.geoModelComputed,
      score: opts.geoModelComputed ? (opts.geoModelScore ?? null) : null,
      reason_not_computed: opts.geoModelComputed ? null : (opts.geoModelReasonNotComputed || "no_location_context"),
    };

    const allbirds_result = lookupAllbirdsByCommonName(prediction.common_name);

    return {
      // Original prediction fields, unmodified — the raw acoustic result
      // must always remain fully accessible (Part 1/16/17 of the spec).
      rank: prediction.rank,
      scientific_name: prediction.scientific_name,
      common_name: prediction.common_name,
      birdnet_id: prediction.birdnet_id,
      idx: prediction.idx,
      acoustic_score: prediction.acoustic_score,
      taxonomic_class: prediction.taxonomic_class || null,

      // Enrichment (additive only):
      sabap2_match: !!record,
      sabap2_lookup_method: lookupMethod,
      sabap2,
      geo_model,
      region_membership,
      allbirds: allbirds_result,
    };
  }

  return {
    load,
    getState,
    lookupByBirdNetId,
    lookupByScientificName,
    lookupAllbirdsByCommonName,
    getCurrentCalendarMonth,
    enrichPrediction,
    COUNTRY_CODES,
  };
})();
