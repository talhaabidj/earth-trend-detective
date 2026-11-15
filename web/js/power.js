// Download monthly data from NASA POWER in the browser. POWER allows this from any website.
// Same cleaning as engine/trend/power.py: drop the 13th "yearly" month, turn -999 into null.

const POWER_URL = "https://power.larc.nasa.gov/api/temporal/monthly";
const MISSING = -999;
const WAIT_SECONDS = 45;
export const LAST_YEAR = 2025;

function pointUrl(variable, place, firstYear) {
  return `${POWER_URL}/point?parameters=${variable}&community=AG` +
    `&longitude=${place.lon.toFixed(3)}&latitude=${place.lat.toFixed(3)}` +
    `&start=${firstYear}&end=${LAST_YEAR}&format=JSON`;
}

function areaUrl(variable, box, firstYear) {
  return `${POWER_URL}/regional?parameters=${variable}&community=AG` +
    `&latitude-min=${box.south.toFixed(2)}&latitude-max=${box.north.toFixed(2)}` +
    `&longitude-min=${box.west.toFixed(2)}&longitude-max=${box.east.toFixed(2)}` +
    `&start=${firstYear}&end=${LAST_YEAR}&format=JSON`;
}

// POWER's {"YYYYMM": value} -> sorted [{year, month, value}].
function toRows(valuesByMonth) {
  const rows = [];
  for (const [key, value] of Object.entries(valuesByMonth)) {
    const year = Number(key.slice(0, 4));
    const month = Number(key.slice(4));
    if (month === 13) continue;
    rows.push({ year, month, value: value === null || value <= MISSING ? null : value });
  }
  return rows.sort((a, b) => a.year - b.year || a.month - b.month);
}

// Average the grid cells of an area. Cells near the poles are smaller, so each counts by cos(latitude).
function areaAverage(cells, variable) {
  const totals = new Map();
  for (const cell of cells) {
    const weight = Math.cos(cell.geometry.coordinates[1] * Math.PI / 180);
    for (const row of toRows(cell.properties.parameter[variable])) {
      const key = row.year * 100 + row.month;
      const entry = totals.get(key) || { year: row.year, month: row.month, total: 0, weights: 0 };
      if (row.value !== null) {
        entry.total += weight * row.value;
        entry.weights += weight;
      }
      totals.set(key, entry);
    }
  }
  return [...totals.keys()].sort((a, b) => a - b).map((key) => {
    const e = totals.get(key);
    return { year: e.year, month: e.month, value: e.weights ? e.total / e.weights : null };
  });
}

// Answers already downloaded in this visit, so going back to a place is instant.
const downloaded = new Map();

async function downloadJson(url) {
  if (downloaded.has(url)) return downloaded.get(url);
  const timer = new AbortController();
  const timeout = setTimeout(() => timer.abort(), WAIT_SECONDS * 1000);
  let response;
  try {
    response = await fetch(url, { signal: timer.signal });
  } catch (error) {
    if (!navigator.onLine) throw new Error("You seem to be offline.");
    if (error.name === "AbortError") throw new Error(`NASA's data service did not answer within ${WAIT_SECONDS} seconds.`);
    throw new Error("NASA's data service could not be reached.");
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    let reason = "";
    try {
      reason = (await response.json()).messages?.join(" ") || "";
    } catch {
      // The error page was not JSON; the status code is enough.
    }
    if (response.status === 429) throw new Error("NASA's data service is busy (too many requests).");
    throw new Error(`NASA's data service answered with an error (${response.status}). ${reason}`.trim());
  }
  const data = await response.json();
  downloaded.set(url, data);
  return data;
}

// Every grid cell in a box, each with its own rows: [{lat, lon, rows}]. Used by the trend map.
export async function getAreaCells(variable, box, firstYear) {
  const url = areaUrl(variable, box, firstYear);
  const data = await downloadJson(url);
  const cells = data.features.map((cell) => ({
    lon: cell.geometry.coordinates[0],
    lat: cell.geometry.coordinates[1],
    rows: toRows(cell.properties.parameter[variable]),
  }));
  return { cells, url };
}

// A square box around a point, `size` degrees wide (POWER allows 2 to 10 degrees).
// Near the poles or the date line the box slides inward, so it keeps its full size.
export function boxOfSize(lat, lon, size) {
  const half = size / 2;
  const middleLat = Math.min(Math.max(lat, -90 + half), 90 - half);
  const middleLon = Math.min(Math.max(lon, -180 + half), 180 - half);
  return {
    south: middleLat - half,
    north: middleLat + half,
    west: middleLon - half,
    east: middleLon + half,
  };
}

// The 2° x 2° "wider area" box (POWER needs at least 2° each way).
export function boxAround(lat, lon) {
  return boxOfSize(lat, lon, 2);
}

// place is {lat, lon} for one grid cell, or {box: {south, north, west, east}} for an area.
export async function getMonthlyData(variable, place, firstYear) {
  if (place.box) {
    const url = areaUrl(variable, place.box, firstYear);
    const data = await downloadJson(url);
    return { rows: areaAverage(data.features, variable), url, cells: data.features.length };
  }
  const url = pointUrl(variable, place, firstYear);
  const data = await downloadJson(url);
  return { rows: toRows(data.properties.parameter[variable]), url, cells: 1 };
}
