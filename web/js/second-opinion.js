// A second opinion from a real thermometer. For average air temperature, the result card also
// shows what the nearest long weather station record says, and whether it agrees with NASA's
// model. The station answers are worked out ahead of time by engine/scripts/build_stations.py.

import { signed } from "./verdict.js";

const FURTHEST_KM = 60;
const EARTH_RADIUS_KM = 6371;
let stationList = null;

function loadStations() {
  if (!stationList) {
    stationList = fetch("data/stations.json")
      .then((response) => response.json())
      .then((data) => data.stations.map(([id, name, lat, lon, months, rate, low, high, verdict]) =>
        ({ id, name, lat, lon, months, rate, low, high, verdict })));
  }
  return stationList;
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const a = Math.sin(radians(lat2 - lat1) / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(radians(lon2 - lon1) / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

// The closest station within reach, as { station, km }, or null.
export function nearestStation(stations, lat, lon) {
  let best = null;
  for (const station of stations) {
    const km = distanceKm(lat, lon, station.lat, station.lon);
    if (km <= FURTHEST_KM && (!best || km < best.km)) best = { station, km };
  }
  return best;
}

// "agree" when both show a clear trend the same way, or neither shows a clear trend.
export function compare(station, modelVerdict, modelRate) {
  const stationClear = station.verdict === "clear";
  const modelClear = modelVerdict === "clear";
  if (stationClear && modelClear) return Math.sign(station.rate) === Math.sign(modelRate) ? "agree" : "disagree";
  return stationClear === modelClear ? "agree" : "disagree";
}

export function secondOpinionText(station, km, modelVerdict, modelRate) {
  const direction = station.rate >= 0 ? "rising" : "falling";
  const strength = station.verdict === "clear" ? "a clear trend" : "not a clear trend";
  const outcome = compare(station, modelVerdict, modelRate);
  const reading = `${station.name} weather station, ${Math.round(km)} km away: ${direction} by ` +
    `${Math.abs(station.rate).toFixed(2)} °C per decade (95% range ${signed(station.low)} to ${signed(station.high)}), ` +
    `${strength} in ${station.months} months of readings since 1981.`;
  const verdict = outcome === "agree"
    ? (station.verdict === "clear"
      ? `It agrees with the NASA model above: both show a clear ${station.rate >= 0 ? "rise" : "fall"}.`
      : "It agrees with the NASA model above: neither shows a clear trend.")
    : "It does not agree with the NASA model above. A station measures one spot and the model about 50 km, " +
      "and either can be off, so treat this result as a lead to check.";
  return { outcome, reading, verdict };
}

// Adds the second opinion to a result card. Does nothing if the station list cannot be loaded.
export async function showSecondOpinion(block, place, modelVerdict, modelRate) {
  let stations;
  try {
    stations = await loadStations();
  } catch {
    return;
  }
  const found = nearestStation(stations, place.lat, place.lon);
  const box = document.createElement("aside");
  box.setAttribute("aria-label", "Second opinion from a weather station");
  if (found) {
    const text = secondOpinionText(found.station, found.km, modelVerdict, modelRate);
    box.className = `second-opinion ${text.outcome}`;
    box.innerHTML = `
      <p class="second-opinion-title">Second opinion from a thermometer: ${text.outcome === "agree" ? "it agrees" : "it does not agree"}</p>
      <p>${text.reading} ${text.verdict}</p>
      <p class="second-opinion-source">Station data: NOAA GHCN-Monthly v4, the station records behind NASA's GISTEMP.</p>`;
  } else {
    box.className = "second-opinion missing";
    box.innerHTML = `<p>Second opinion: no long weather station record within ${FURTHEST_KM} km of this place, so the NASA model's answer could not be checked against a thermometer here.</p>`;
  }
  const before = block.querySelector(".result-tabs") || block.querySelector(".source");
  block.insertBefore(box, before);
}
