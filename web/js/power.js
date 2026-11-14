// SI-assisted: written with Claude Code (Anthropic) under the team's direction; see docs/AI_USE.md.
// Fetch NASA POWER monthly data in the browser (POWER allows cross-origin requests).
// Mirrors engine/trend/power.py: drops the 13th "annual" month and the -999 fill value.

const POWER_BASE = "https://power.larc.nasa.gov/api/temporal/monthly";
export const LAST_FULL_YEAR = 2025;
const FILL = -999;

export function pointUrl(variable, lat, lon, startYear, endYear = LAST_FULL_YEAR) {
  return `${POWER_BASE}/point?parameters=${variable}&community=AG&longitude=${lon.toFixed(3)}` +
    `&latitude=${lat.toFixed(3)}&start=${startYear}&end=${endYear}&format=JSON`;
}

export function regionUrl(variable, box, startYear, endYear = LAST_FULL_YEAR) {
  return `${POWER_BASE}/regional?parameters=${variable}&community=AG` +
    `&latitude-min=${box.south.toFixed(2)}&latitude-max=${box.north.toFixed(2)}` +
    `&longitude-min=${box.west.toFixed(2)}&longitude-max=${box.east.toFixed(2)}` +
    `&start=${startYear}&end=${endYear}&format=JSON`;
}

export function parseMonthly(valuesByKey) {
  return Object.entries(valuesByKey)
    .map(([key, value]) => ({ year: +key.slice(0, 4), month: +key.slice(4), value }))
    .filter((d) => d.month >= 1 && d.month <= 12)
    .map((d) => ({ ...d, value: d.value === null || d.value <= FILL + 0.5 ? null : d.value }))
    .sort((a, b) => a.year - b.year || a.month - b.month);
}

function areaWeightedMean(features, variable) {
  const sums = new Map(), weights = new Map(), keys = new Set();
  for (const f of features) {
    const w = Math.cos(f.geometry.coordinates[1] * Math.PI / 180);
    for (const d of parseMonthly(f.properties.parameter[variable])) {
      const key = d.year * 100 + d.month;
      keys.add(key);
      if (d.value === null) continue;
      sums.set(key, (sums.get(key) || 0) + w * d.value);
      weights.set(key, (weights.get(key) || 0) + w);
    }
  }
  return [...keys].sort((a, b) => a - b).map((key) => ({
    year: Math.floor(key / 100), month: key % 100,
    value: weights.has(key) ? sums.get(key) / weights.get(key) : null,
  }));
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    let detail = "";
    try { detail = (await response.json()).messages?.join(" ") || ""; } catch { /* not JSON */ }
    throw new Error(`NASA POWER answered ${response.status}. ${detail}`.trim());
  }
  return response.json();
}

// place: {lat, lon} for a grid cell, or {box: {south, north, west, east}} for an area (>= 2° each side).
export async function fetchSeries(variable, place, startYear) {
  if (place.box) {
    const url = regionUrl(variable, place.box, startYear);
    const data = await getJson(url);
    return { series: areaWeightedMean(data.features, variable), url, cells: data.features.length };
  }
  const url = pointUrl(variable, place.lat, place.lon, startYear);
  const data = await getJson(url);
  return { series: parseMonthly(data.properties.parameter[variable]), url, cells: 1 };
}

export function boxAround(lat, lon, halfSize = 1) {
  const south = Math.max(-89, lat - halfSize), north = Math.min(89, lat + halfSize);
  const west = Math.max(-179.9, lon - halfSize), east = Math.min(179.9, lon + halfSize);
  return { south, north, west, east };
}
