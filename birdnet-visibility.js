/**
 * BirdNET user visibility preferences.
 *
 * This module only selects which already-ranked rows are shown. It never
 * changes BirdNET scores, candidate records, ranking, Geo inference, or
 * SABAP2 evidence. All rows remain available to diagnostics.
 */
(function (root) {
  "use strict";

  const DEFAULTS = Object.freeze({
    recordingLocation: "automatic",
    country: "ZA",
    province: "GP",
    uncommonSpecies: "normal",
    showVagrants: false,
  });

  const COUNTRY_CODES = ["ZA", "NA", "BW", "ZW", "MZ", "ZM", "MW", "LS", "SZ"];
  const PROVINCE_CODES = ["EC", "FS", "GP", "KZN", "LP", "MP", "NC", "NW", "WC"];

  function normalize(settings) {
    const value = Object.assign({}, DEFAULTS, settings || {});
    if (!["automatic", "country", "province", "southern_africa", "none"].includes(value.recordingLocation)) {
      value.recordingLocation = DEFAULTS.recordingLocation;
    }
    if (!COUNTRY_CODES.includes(value.country)) value.country = DEFAULTS.country;
    if (!PROVINCE_CODES.includes(value.province)) value.province = DEFAULTS.province;
    if (!["light", "normal", "strict"].includes(value.uncommonSpecies)) {
      value.uncommonSpecies = DEFAULTS.uncommonSpecies;
    }
    value.showVagrants = value.showVagrants === true;
    return value;
  }

  function hasProvinceEvidence(sabap2, province) {
    return !!(sabap2 && sabap2.province_data && sabap2.province_data[province]);
  }

  function hasCountryEvidence(sabap2, country) {
    const rates = sabap2 && sabap2.country_rates;
    return !!(rates && rates[country] !== null && rates[country] !== undefined);
  }

  function hasAnyOccurrenceEvidence(sabap2) {
    if (!sabap2) return false;
    if (sabap2.regional_occurrence === true) return true;
    if (Object.values(sabap2.country_rates || {}).some((value) => value !== null && value !== undefined)) return true;
    return Array.isArray(sabap2.sa_provinces_found) && sabap2.sa_provinces_found.length > 0;
  }

  function selectedLocationEvidence(row, settings) {
    const sabap2 = row && row.sabap2;
    if (!sabap2) return false;
    if (settings.recordingLocation === "country") return hasCountryEvidence(sabap2, settings.country);
    if (settings.recordingLocation === "province") return hasProvinceEvidence(sabap2, settings.province);
    if (settings.recordingLocation === "southern_africa") return sabap2.regional_occurrence === true;
    return false;
  }

  function isGpsNormalGeoDisagreement(row, settings) {
    // Existing Geo disagreement boundary from experimental-ranking-core.js.
    return settings.recordingLocation === "automatic" &&
      settings.uncommonSpecies === "normal" &&
      row && row.geoComputed === true &&
      row.geoScore !== null && row.geoScore !== undefined &&
      row.geoScore < 0.05;
  }

  function shouldShow(row, rawSettings) {
    const settings = normalize(rawSettings);
    const classification = row && row.geographicClassification;
    const localEvidence = selectedLocationEvidence(row, settings);

    // Explicitly requested by the user: diagnostics retain every candidate;
    // turning vagrants on makes the complete existing ranked set visible.
    if (settings.showVagrants) return true;

    // GPS + NORMAL uses the existing Geo disagreement boundary as the
    // primary local-plausibility signal. No local exception is invented yet:
    // sparse provincial rows must not override strong GPS disagreement.
    if (isGpsNormalGeoDisagreement(row, settings)) return false;

    // A positive selected country/province row is additive evidence and may
    // preserve a candidate otherwise marked unlikely. A missing row is never
    // interpreted as absence.
    if (localEvidence) return true;

    if (settings.uncommonSpecies === "strict") {
      return classification === "GEOGRAPHICALLY_SUPPORTED";
    }

    if (settings.recordingLocation === "none") {
      // No location filtering still respects the explicit Vagrants=OFF
      // preference, but does not use Geo/country/province to narrow results.
      return classification !== "GEOGRAPHICALLY_UNLIKELY";
    }

    if (classification !== "GEOGRAPHICALLY_UNLIKELY") return true;

    // LIGHT exposes uncommon candidates when there is at least some existing
    // SABAP2 occurrence evidence, without using an acoustic-score cutoff.
    return settings.uncommonSpecies === "light" && hasAnyOccurrenceEvidence(row && row.sabap2);
  }

  function selectRows(rows, rawSettings) {
    const settings = normalize(rawSettings);
    const visibleRows = [];
    const hiddenRows = [];
    (rows || []).forEach((row) => (shouldShow(row, settings) ? visibleRows : hiddenRows).push(row));
    return { visibleRows, hiddenRows, settings };
  }

  function loadSettings(storage, key) {
    try {
      return normalize(JSON.parse(storage.getItem(key) || '{}'));
    } catch (e) {
      return normalize();
    }
  }

  function saveSettings(storage, key, settings) {
    const normalized = normalize(settings);
    try { storage.setItem(key, JSON.stringify(normalized)); } catch (e) { /* storage unavailable — non-fatal */ }
    return normalized;
  }

  root.BirdNetVisibility = {
    DEFAULTS,
    COUNTRY_CODES,
    PROVINCE_CODES,
    normalize,
    selectedLocationEvidence,
    shouldShow,
    selectRows,
    loadSettings,
    saveSettings,
  };
})(typeof window !== "undefined" ? window : globalThis);
