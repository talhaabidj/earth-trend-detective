// The explorer: pick a place and a variable, get NASA POWER data, test for a trend, show it.

import { THEMES, VARIABLES, PLACE_TYPES, findVariable } from "./catalogue.js";
import { getMonthlyData, boxAround, boxOfSize } from "./power.js";
import { showResult } from "./result-view.js";
import { showStoryList } from "./stories.js";
import { mapTrends } from "./trend-map.js";

const QUICK_PLACES = [
  { name: "Lahore", lat: 31.55, lon: 74.34 },
  { name: "Jacobabad", lat: 28.28, lon: 68.44 },
  { name: "Karachi", lat: 24.86, lon: 67.01 },
  { name: "Hunza", lat: 36.32, lon: 74.65 },
  { name: "Phoenix", lat: 33.45, lon: -112.07 },
  { name: "Manaus", lat: -3.12, lon: -60.02 },
  { name: "Svalbard", lat: 78.22, lon: 15.65 },
  { name: "Niamey", lat: 13.51, lon: 2.11 },
];

// Everything the user has chosen so far.
const choice = {
  lat: 31.55,
  lon: 74.34,
  placeName: "Lahore",
  wideArea: false,
  theme: "heat",
  variableId: "T2M",
  suggested: [],
};

const byId = (id) => document.getElementById(id);
let map = null;
let marker = null;
let boxOnMap = null;

const keepLatInRange = (lat) => Math.min(89, Math.max(-89, Number.isFinite(lat) ? lat : 0));
const wrapLon = (lon) => (Number.isFinite(lon) ? ((((lon + 180) % 360) + 360) % 360) - 180 : 0);

function placeLabel() {
  const ns = choice.lat >= 0 ? "N" : "S";
  const ew = choice.lon >= 0 ? "E" : "W";
  const coordinates = `${Math.abs(choice.lat).toFixed(2)}°${ns}, ${Math.abs(choice.lon).toFixed(2)}°${ew}`;
  const name = choice.placeName ? `${choice.placeName} (${coordinates})` : coordinates;
  return choice.wideArea ? `${name}, 2° area` : name;
}

function placeForDownload() {
  return choice.wideArea ? { box: boxAround(choice.lat, choice.lon) } : { lat: choice.lat, lon: choice.lon };
}

// --- Link to a result: ?lat=..&lon=..&v=..&area=box&name=.. ---------------------------------

function readChoiceFromLink() {
  const link = new URLSearchParams(location.search);
  if (link.has("lat") && link.has("lon")) {
    choice.lat = keepLatInRange(Number(link.get("lat")));
    choice.lon = wrapLon(Number(link.get("lon")));
    choice.placeName = link.get("name") || "";
  }
  const variable = findVariable(link.get("v"));
  if (variable && !variable.examplesOnly) {
    choice.variableId = variable.id;
    choice.theme = variable.theme;
  }
  choice.wideArea = link.get("area") === "box";
  return link.has("lat") && link.has("v");
}

function writeChoiceToLink() {
  const link = new URLSearchParams({
    lat: choice.lat.toFixed(2), lon: choice.lon.toFixed(2), v: choice.variableId, area: choice.wideArea ? "box" : "cell",
  });
  if (choice.placeName) link.set("name", choice.placeName);
  history.replaceState(null, "", `?${link}${location.hash}`);
}

// --- Step 1: the place ----------------------------------------------------------------------

function setPlace(lat, lon, name = "") {
  choice.lat = keepLatInRange(lat);
  choice.lon = wrapLon(lon);
  choice.placeName = name;
  byId("lat").value = choice.lat.toFixed(2);
  byId("lon").value = choice.lon.toFixed(2);
  if (map) {
    marker.setLatLng([choice.lat, choice.lon]);
    drawBoxOnMap();
  }
  for (const button of document.querySelectorAll("#presets .chip")) {
    button.setAttribute("aria-pressed", String(button.dataset.name === name));
  }
}

function drawBoxOnMap() {
  if (boxOnMap) boxOnMap.remove();
  boxOnMap = null;
  if (!map || !choice.wideArea) return;
  const box = boxAround(choice.lat, choice.lon);
  boxOnMap = L.rectangle([[box.south, box.west], [box.north, box.east]], { color: "#2a78d6", weight: 2, fillOpacity: 0.08 }).addTo(map);
}

function setUpMap() {
  if (!window.L) {
    byId("map").textContent = "The map could not load. Type a latitude and longitude instead.";
    return;
  }
  map = L.map("map", { worldCopyJump: true }).setView([choice.lat, choice.lon], 4);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 12,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  marker = L.marker([choice.lat, choice.lon], { keyboard: false }).addTo(map);
  map.on("click", (event) => setPlace(event.latlng.lat, event.latlng.lng));
}

function setUpPlaceControls() {
  for (const place of QUICK_PLACES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.dataset.name = place.name;
    button.textContent = place.name;
    button.addEventListener("click", () => {
      setPlace(place.lat, place.lon, place.name);
      if (map) map.setView([place.lat, place.lon], 5);
    });
    byId("presets").appendChild(button);
  }
  const typedPlace = () => setPlace(Number(byId("lat").value), Number(byId("lon").value));
  byId("lat").addEventListener("change", typedPlace);
  byId("lon").addEventListener("change", typedPlace);
  for (const radio of document.querySelectorAll('input[name="area"]')) {
    radio.checked = (radio.value === "box") === choice.wideArea;
    radio.addEventListener("change", () => {
      choice.wideArea = radio.value === "box";
      drawBoxOnMap();
    });
  }
  setPlace(choice.lat, choice.lon, choice.placeName);
}

// --- Step 2: the variable -------------------------------------------------------------------

function showThemes() {
  const tabs = byId("themes");
  tabs.replaceChildren();
  for (const theme of THEMES) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "tab";
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", String(theme.id === choice.theme));
    tab.textContent = theme.question;
    tab.addEventListener("click", () => {
      choice.theme = theme.id;
      showThemes();
      showVariables();
    });
    tabs.appendChild(tab);
  }
}

function showVariables() {
  const grid = byId("variables");
  grid.replaceChildren();
  const shown = VARIABLES.filter((v) => !v.examplesOnly && (v.theme === choice.theme || choice.suggested.includes(v.id)));
  for (const variable of shown) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = choice.suggested.includes(variable.id) ? "variable-card suggested" : "variable-card";
    card.setAttribute("aria-pressed", String(variable.id === choice.variableId));
    card.innerHTML = `<strong>${variable.name}</strong><span>${variable.plain}</span>`;
    card.title = variable.why;
    card.addEventListener("click", () => {
      choice.variableId = variable.id;
      showVariables();
    });
    grid.appendChild(card);
  }
}

function setUpPlaceTypes() {
  const select = byId("place-type");
  for (const type of PLACE_TYPES) select.add(new Option(type.label, type.id));
  select.addEventListener("change", () => {
    const type = PLACE_TYPES.find((t) => t.id === select.value);
    choice.suggested = type ? type.suggest : [];
    byId("place-type-reason").textContent = type ? `${type.reason} Suggested variables are marked below.` : "";
    if (type) choice.variableId = type.suggest[0];
    showVariables();
  });
}

// --- Step 3: run the test -------------------------------------------------------------------

async function analysePlace(container, variable) {
  const { rows, url, cells } = await getMonthlyData(variable.id, placeForDownload(), variable.startYear);
  showResult(container, { rows, variable, label: placeLabel(), sourceUrl: url, cells });
  return rows;
}

function csvText(rows, variable, label) {
  const lines = [
    `# ${variable.name} (${variable.id}), ${variable.units}, ${label}`,
    "# Source: NASA POWER, https://power.larc.nasa.gov/",
    "year,month,value",
  ];
  for (const row of rows) lines.push(`${row.year},${row.month},${row.value ?? ""}`);
  return lines.join("\n");
}

function smallButton(text, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary";
  button.textContent = text;
  button.addEventListener("click", onClick);
  return button;
}

function addResultButtons(results, grid, rows, variable, label) {
  const download = smallButton("Download data (CSV)", () => {
    const file = new Blob([csvText(rows, variable, label)], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(file);
    link.download = `${variable.id}_${choice.lat.toFixed(2)}_${choice.lon.toFixed(2)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  });

  let waitingForSecondPlace = false;
  const compare = smallButton("Compare with another place", async () => {
    if (!waitingForSecondPlace) {
      waitingForSecondPlace = true;
      compare.textContent = "Add to comparison";
      byId("status").textContent = "Choose a second place on the map, then press “Add to comparison”.";
      byId("explore").scrollIntoView({ behavior: "smooth" });
      return;
    }
    compare.disabled = true;
    try {
      grid.classList.add("two");
      await analysePlace(grid, variable);
      byId("status").textContent = "";
      compare.remove();
    } catch (error) {
      byId("status").textContent = `Could not get the data: ${error.message}`;
      compare.disabled = false;
    }
  });

  const share = smallButton("Copy link to this result", async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      share.textContent = "Link copied";
    } catch {
      share.textContent = location.href;
    }
  });

  const buttons = document.createElement("div");
  buttons.className = "actions";
  buttons.append(download, compare, share);
  results.appendChild(buttons);
}

async function runTest() {
  const button = byId("run");
  const status = byId("status");
  const results = byId("results");
  const variable = findVariable(choice.variableId);
  button.disabled = true;
  status.className = "status";
  status.textContent = "Asking NASA POWER for the data…";
  writeChoiceToLink();
  try {
    results.replaceChildren();
    results.hidden = false;
    const grid = document.createElement("div");
    grid.className = "compare-grid";
    results.appendChild(grid);
    const label = placeLabel();
    const rows = await analysePlace(grid, variable);
    addResultButtons(results, grid, rows, variable, label);
    status.textContent = "";
    grid.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    status.className = "status error";
    status.textContent = `Could not get the data: ${error.message} Try again, or watch an example above.`;
  } finally {
    button.disabled = false;
  }
}

// --- Where is it changing? (the trend map) --------------------------------------------------

let trendMap = null;
let trendLayer = null;

function setUpTrendMap() {
  if (!window.L) return;
  trendMap = L.map("trend-map", { worldCopyJump: true }).setView([choice.lat, choice.lon], 5);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 10,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(trendMap);
  trendLayer = L.layerGroup().addTo(trendMap);
  byId("map-run").addEventListener("click", runTrendMap);
}

async function runTrendMap() {
  if (!trendMap) return;
  const variable = findVariable(choice.variableId);
  const size = Number(byId("map-size").value);
  const button = byId("map-run");
  const status = byId("map-status");
  button.disabled = true;
  status.className = "status";
  status.textContent = "Asking NASA POWER for every grid cell (this can take 10 seconds)…";
  byId("map-question").textContent = `${variable.name}, ${variable.startYear}–2025, ${size}° × ${size}° around ${placeLabel()}`;
  try {
    const box = boxOfSize(choice.lat, choice.lon, size);
    const map = await mapTrends(trendMap, trendLayer, variable, box, (lat, lon) => {
      setPlace(lat, lon);
      runTest();
    });
    byId("map-summary").textContent = map.summary;
    byId("map-legend").innerHTML = map.legend;
    byId("map-source").innerHTML = `Data: ${variable.source}. <a href="${map.url}" target="_blank" rel="noopener">See the exact data request</a>.`;
    status.textContent = "";
  } catch (error) {
    status.className = "status error";
    status.textContent = `Could not get the data: ${error.message}`;
  } finally {
    button.disabled = false;
  }
}

function start() {
  const linkHasResult = readChoiceFromLink();
  setUpMap();
  setUpPlaceControls();
  drawBoxOnMap();
  setUpPlaceTypes();
  showThemes();
  showVariables();
  byId("run").addEventListener("click", runTest);
  setUpTrendMap();
  showStoryList(byId("story-list"), byId("story-player"));
  if (linkHasResult) runTest();
}

start();
