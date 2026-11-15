// The explorer: pick a place and a question, get NASA POWER data, test for a trend, show it.

import { THEMES, VARIABLES, PLACE_TYPES, findVariable } from "./catalogue.js";
import { getMonthlyData, boxAround, boxOfSize } from "./power.js";
import { showResult } from "./result-view.js";
import { setUpPlaceSearch } from "./search.js";
import { showStoryList, showHeroCase } from "./stories.js";
import { mapTrends } from "./trend-map.js";
import { revealOnScroll, countWhenSeen, followScroll } from "./motion.js";

const QUICK_PLACES = [
  { name: "Lahore", lat: 31.55, lon: 74.34 },
  { name: "Jacobabad", lat: 28.28, lon: 68.44 },
  { name: "Hunza", lat: 36.32, lon: 74.65 },
  { name: "Phoenix", lat: 33.45, lon: -112.07 },
  { name: "Manaus", lat: -3.12, lon: -60.02 },
  { name: "Svalbard", lat: 78.22, lon: 15.65 },
];

// One-click questions on the first screen.
const STARTERS = [
  { text: "Is Lahore getting hotter?", place: QUICK_PLACES[0], variable: "T2M" },
  { text: "Are Jacobabad's nights warming?", place: QUICK_PLACES[1], variable: "T2M_MIN" },
  { text: "Is Phoenix getting drier air?", place: QUICK_PLACES[3], variable: "RH2M" },
  { text: "Is the Amazon getting less rain?", place: QUICK_PLACES[4], variable: "PRECTOTCORR" },
  { text: "Is Svalbard losing its snow?", place: QUICK_PLACES[5], variable: "SNODP" },
];

// Everything the visitor has chosen so far.
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
const onTouchScreen = window.matchMedia("(pointer: coarse)").matches;
let map = null;
let marker = null;
let boxOnMap = null;
let latestRun = 0;
let runTimer = null;

const keepLatInRange = (lat) => Math.min(90, Math.max(-90, Number.isFinite(lat) ? lat : 0));
const wrapLon = (lon) => (Number.isFinite(lon) ? ((((lon + 180) % 360) + 360) % 360) - 180 : 0);

function coordinatesText(lat, lon) {
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? "E" : "W"}`;
}

function placeLabel(place = choice, wideArea = choice.wideArea) {
  const coordinates = coordinatesText(place.lat, place.lon);
  const name = place.placeName || place.name;
  const label = name ? `${name} (${coordinates})` : coordinates;
  return wideArea ? `${label}, 2° area` : label;
}

function placeForDownload(place = choice) {
  return choice.wideArea ? { box: boxAround(place.lat, place.lon) } : { lat: place.lat, lon: place.lon };
}

// --- Light and dark ----------------------------------------------------------------------------

function setUpThemeButton() {
  byId("theme-toggle").addEventListener("click", () => {
    const root = document.documentElement;
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const nowDark = root.dataset.theme ? root.dataset.theme === "dark" : systemDark;
    root.dataset.theme = nowDark ? "light" : "dark";
    try {
      localStorage.setItem("theme", root.dataset.theme);
    } catch {
      // Storage is blocked; the choice lasts until the page is closed.
    }
  });
}

// --- Link to a result: ?lat=..&lon=..&v=..&area=box&name=.. ------------------------------------

function readChoiceFromLink() {
  const link = new URLSearchParams(location.search);
  const linkLat = Number(link.get("lat"));
  const linkLon = Number(link.get("lon"));
  const goodPlace = link.has("lat") && link.has("lon") && Number.isFinite(linkLat) && Number.isFinite(linkLon) && Math.abs(linkLat) <= 90;
  if (goodPlace) {
    choice.lat = keepLatInRange(Number(link.get("lat")));
    choice.lon = wrapLon(Number(link.get("lon")));
    choice.placeName = (link.get("name") || "").slice(0, 80);
  }
  const variable = findVariable(link.get("v"));
  if (variable && !variable.examplesOnly) {
    choice.variableId = variable.id;
    choice.theme = variable.theme;
  }
  choice.wideArea = link.get("area") === "box";
  return goodPlace && link.has("v");
}

function writeChoiceToLink() {
  const link = new URLSearchParams({
    lat: choice.lat.toFixed(2), lon: choice.lon.toFixed(2), v: choice.variableId, area: choice.wideArea ? "box" : "cell",
  });
  if (choice.placeName) link.set("name", choice.placeName);
  history.replaceState(null, "", `?${link}`);
}

// --- Step 1: the place -------------------------------------------------------------------------

function setPlace(lat, lon, name = "") {
  choice.lat = keepLatInRange(lat);
  choice.lon = wrapLon(lon);
  choice.placeName = name;
  byId("lat").value = choice.lat.toFixed(2);
  byId("lon").value = choice.lon.toFixed(2);
  byId("chosen-place").textContent = `Chosen: ${placeLabel()}`;
  if (map) {
    marker.setLatLng([choice.lat, choice.lon]);
    marker.setIcon(pinIcon()); // a fresh icon replays the drop
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

// On phones one finger scrolls the page and two fingers move the map, so the map never traps the page.
function newMap(elementId, zoom, maxZoom) {
  const leafletMap = L.map(elementId, { worldCopyJump: true, dragging: !onTouchScreen, scrollWheelZoom: false })
    .setView([choice.lat, choice.lon], zoom);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(leafletMap);
  return leafletMap;
}

// A pin drawn in the page (no image file), so it can drop in when the place changes.
function pinIcon() {
  return L.divIcon({
    className: "pin",
    iconSize: [30, 40],
    iconAnchor: [15, 38],
    html: '<span class="pin-drop"><svg viewBox="0 0 30 40" width="30" height="40" aria-hidden="true">' +
      '<path d="M15 1C7.3 1 1 7.2 1 14.9 1 25 15 39 15 39s14-14 14-24.1C29 7.2 22.7 1 15 1z" fill="#1c5cab" stroke="#fff" stroke-width="2"/>' +
      '<circle cx="15" cy="15" r="5" fill="#fff"/></svg></span>',
  });
}

function setUpMap() {
  if (!window.L) {
    byId("map").textContent = "The map could not load. Search for a place instead.";
    return;
  }
  map = newMap("map", 4, 12);
  marker = L.marker([choice.lat, choice.lon], { keyboard: false, icon: pinIcon() }).addTo(map);
  map.on("click", (event) => {
    setPlace(event.latlng.lat, event.latlng.lng);
    byId("place-search").value = "";
    runSoon();
  });
  byId("map-hint").textContent = onTouchScreen
    ? "Tap the map to choose a place. Use two fingers to move or zoom it."
    : "Click the map to choose a place. Use the + and − buttons to zoom.";
}

function goToPlace(place) {
  setPlace(place.lat, place.lon, place.name);
  if (map) map.setView([place.lat, place.lon], 5);
  runSoon();
}

function useMyLocation() {
  const status = byId("status");
  if (!navigator.geolocation) {
    showStatus("This browser cannot share a location. Search for your city instead.", "error");
    return;
  }
  showStatus("Asking your browser for your location…", "busy");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      // One decimal (about 10 km) is enough for a 50 km grid cell and keeps the exact spot private.
      const lat = Math.round(position.coords.latitude * 10) / 10;
      const lon = Math.round(position.coords.longitude * 10) / 10;
      status.textContent = "";
      goToPlace({ lat, lon, name: "My location" });
    },
    () => showStatus("The location was not shared. Search for your city or click the map instead.", "error"),
    { timeout: 15000, maximumAge: 600000 },
  );
}

function setUpPlaceControls() {
  for (const place of QUICK_PLACES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.dataset.name = place.name;
    button.textContent = place.name;
    button.addEventListener("click", () => goToPlace(place));
    byId("presets").appendChild(button);
  }
  setUpPlaceSearch(byId("place-search"), byId("place-options"), goToPlace);
  byId("use-location").addEventListener("click", useMyLocation);

  const typedPlace = () => {
    setPlace(Number(byId("lat").value), Number(byId("lon").value));
    if (map) map.setView([choice.lat, choice.lon]);
    runSoon();
  };
  byId("lat").addEventListener("change", typedPlace);
  byId("lon").addEventListener("change", typedPlace);
  for (const radio of document.querySelectorAll('input[name="area"]')) {
    radio.checked = (radio.value === "box") === choice.wideArea;
    radio.addEventListener("change", () => {
      choice.wideArea = radio.value === "box";
      setPlace(choice.lat, choice.lon, choice.placeName);
      runSoon();
    });
  }
  setPlace(choice.lat, choice.lon, choice.placeName);
}

// --- Step 2: the question ----------------------------------------------------------------------

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
  const list = byId("variables");
  list.replaceChildren();
  const shown = VARIABLES.filter((v) => !v.examplesOnly && (v.theme === choice.theme || choice.suggested.includes(v.id)));
  for (const variable of shown) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "variable-card";
    card.setAttribute("aria-pressed", String(variable.id === choice.variableId));
    const suggested = choice.suggested.includes(variable.id) ? "<em>Suggested</em>" : "";
    card.innerHTML = `<strong>${variable.name}${suggested}</strong><span>${variable.plain}</span>`;
    card.title = variable.why;
    card.addEventListener("click", () => {
      choice.variableId = variable.id;
      showVariables();
      runSoon();
    });
    list.appendChild(card);
  }
}

function chooseVariable(variableId) {
  choice.variableId = variableId;
  choice.theme = findVariable(variableId).theme;
  showThemes();
  showVariables();
}

function setUpPlaceTypes() {
  const select = byId("place-type");
  for (const type of PLACE_TYPES) select.add(new Option(type.label, type.id));
  select.addEventListener("change", () => {
    const type = PLACE_TYPES.find((t) => t.id === select.value);
    choice.suggested = type ? type.suggest : [];
    byId("place-type-reason").textContent = type ? `${type.reason} Suggested questions are marked above.` : "";
    if (type) chooseVariable(type.suggest[0]);
    else showVariables();
    if (type) runSoon();
  });
}

// --- Step 3: the result ------------------------------------------------------------------------

function showStatus(text, kind = "") {
  const status = byId("status");
  status.className = kind ? `status ${kind}` : "status";
  status.textContent = text;
}

function csvText(rows, variable, label) {
  const lines = [
    `# ${variable.name} (${variable.id}), ${variable.units || "no units"}, ${label}`,
    "# Source: NASA POWER, https://power.larc.nasa.gov/",
    "year,month,value",
  ];
  for (const row of rows) lines.push(`${row.year},${row.month},${row.value ?? ""}`);
  return lines.join("\n");
}

function smallButton(text, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button secondary";
  button.textContent = text;
  button.addEventListener("click", onClick);
  return button;
}

// A search box under the result: pick a second place and its result appears next to the first.
function compareBox(grid, variable) {
  const box = document.createElement("div");
  box.className = "compare-box panel";
  box.innerHTML = `<p>Compare with another place, same question:</p>
    <div class="search">
      <input type="search" placeholder="Search a second place" autocomplete="off" spellcheck="false" role="combobox"
        aria-expanded="false" aria-controls="compare-options" aria-autocomplete="list" aria-label="Search a second place to compare">
      <ul id="compare-options" class="search-options" role="listbox" hidden></ul>
    </div>
    <span class="chips"></span>`;

  async function addPlace(place) {
    showStatus(`Asking NASA for ${place.name}…`, "busy");
    try {
      const { rows, url, cells } = await getMonthlyData(variable.id, placeForDownload(place), variable.startYear);
      grid.querySelectorAll(".result:not(:first-child)").forEach((old) => old.remove());
      grid.classList.add("two");
      showResult(grid, { rows, variable, label: placeLabel(place), sourceUrl: url, cells, place: { lat: place.lat, lon: place.lon } });
      showStatus("");
    } catch (error) {
      showStatus(`${error.message} Try again in a moment.`, "error");
    }
  }

  setUpPlaceSearch(box.querySelector("input"), box.querySelector("ul"), addPlace);
  for (const place of QUICK_PLACES.filter((p) => p.name !== choice.placeName).slice(0, 4)) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = place.name;
    chip.addEventListener("click", () => addPlace(place));
    box.querySelector(".chips").appendChild(chip);
  }
  return box;
}

function resultButtons(rows, variable, label) {
  const download = smallButton("Download data (CSV)", () => {
    const file = new Blob([csvText(rows, variable, label)], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(file);
    link.download = `${variable.id}_${choice.lat.toFixed(2)}_${choice.lon.toFixed(2)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  });
  const nearby = smallButton("Map where it is changing nearby", () => {
    byId("map-trends").scrollIntoView({ behavior: "smooth" });
    runTrendMap();
  });
  const share = smallButton("Copy link to this result", async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      share.textContent = "Link copied";
    } catch {
      share.textContent = "Copy the address from the address bar";
    }
  });
  const buttons = document.createElement("div");
  buttons.className = "actions";
  buttons.append(nearby, download, share);
  return buttons;
}

// While NASA answers: grey placeholder shapes the first time, a dimmed old result after that.
function showLoading() {
  const results = byId("results");
  if (results.hidden) {
    byId("results-empty").hidden = true;
    results.hidden = false;
    results.innerHTML = '<div class="result skeleton" aria-hidden="true"><div class="bone short"></div>' +
      '<div class="bone title"></div><div class="bone block"></div><div class="bone chart"></div></div>';
  } else {
    results.classList.add("refreshing");
  }
}

function stopLoading(failed) {
  const results = byId("results");
  results.classList.remove("refreshing");
  if (failed && results.querySelector(".skeleton")) {
    results.replaceChildren();
    results.hidden = true;
    byId("results-empty").hidden = false;
  }
}

async function runTest() {
  clearTimeout(runTimer);
  const thisRun = ++latestRun;
  const results = byId("results");
  const variable = findVariable(choice.variableId);
  const label = placeLabel();
  const place = placeForDownload();
  byId("run").disabled = true;
  showStatus(`Asking NASA for ${variable.name.toLowerCase()} at ${choice.placeName || "this place"}…`, "busy");
  writeChoiceToLink();
  showLoading();
  try {
    const { rows, url, cells } = await getMonthlyData(variable.id, place, variable.startYear);
    if (thisRun !== latestRun) return; // the visitor has already asked for something newer
    stopLoading(false);
    results.replaceChildren();
    const grid = document.createElement("div");
    grid.className = "compare-grid";
    results.appendChild(grid);
    showResult(grid, { rows, variable, label, sourceUrl: url, cells, place: { lat: choice.lat, lon: choice.lon } });
    results.append(resultButtons(rows, variable, label), compareBox(grid, variable));
    results.hidden = false;
    byId("results-empty").hidden = true;
    showStatus("");
    const top = results.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.6) byId("status").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    if (thisRun !== latestRun) return;
    stopLoading(true);
    showStatus(`${error.message} Try again in a moment, or open one of the solved cases above.`, "error");
  } finally {
    if (thisRun === latestRun) byId("run").disabled = false;
  }
}

// Wait a moment after a choice, so two quick clicks make one request.
function runSoon() {
  clearTimeout(runTimer);
  runTimer = setTimeout(runTest, 350);
}

function openCase(place, variableId) {
  chooseVariable(variableId);
  setPlace(place.lat, place.lon, place.name);
  byId("place-search").value = place.name || "";
  if (map) map.setView([place.lat, place.lon], 5);
  byId("explore").scrollIntoView({ behavior: "smooth" });
  runTest();
}

function setUpStarters() {
  for (const starter of STARTERS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "starter";
    button.textContent = starter.text;
    button.addEventListener("click", () => openCase(starter.place, starter.variable));
    byId("starters").appendChild(button);
  }
  byId("start-button").addEventListener("click", () => setTimeout(() => byId("place-search").focus({ preventScroll: true }), 400));
}

// --- Where is it changing? (the trend map) -----------------------------------------------------

let trendMap = null;
let trendLayer = null;

function setUpTrendMap() {
  if (!window.L) return;
  trendMap = newMap("trend-map", 5, 10);
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
  status.className = "status busy";
  status.textContent = "Asking NASA for every grid cell (about 10 seconds)…";
  byId("map-question").textContent = `${variable.name}, ${variable.startYear}–2025, ${size}° × ${size}° around ${placeLabel(choice, false)}`;
  try {
    const box = boxOfSize(choice.lat, choice.lon, size);
    const drawn = await mapTrends(trendMap, trendLayer, variable, box, (lat, lon) => {
      setPlace(lat, lon);
      byId("explore").scrollIntoView({ behavior: "smooth" });
      runTest();
    });
    byId("map-summary").textContent = drawn.summary;
    byId("map-legend").innerHTML = drawn.legend;
    byId("map-source").innerHTML = `Data: ${variable.source}. <a href="${drawn.url}" target="_blank" rel="noopener">See the exact data request</a>.`;
    status.className = "status";
    status.textContent = "";
  } catch (error) {
    status.className = "status error";
    status.textContent = `${error.message} Try again in a moment.`;
  } finally {
    button.disabled = false;
  }
}

function start() {
  const linkHasResult = readChoiceFromLink();
  setUpThemeButton();
  setUpMap();
  setUpPlaceControls();
  setUpPlaceTypes();
  showThemes();
  showVariables();
  setUpStarters();
  setUpTrendMap();
  byId("run").addEventListener("click", runTest);
  showStoryList(byId("story-list"), byId("story-player"), openCase);
  showHeroCase(byId("hero-case"), () => {
    byId("examples").scrollIntoView({ behavior: "smooth" });
    byId("story-list").querySelector(".story-card")?.focus({ preventScroll: true });
  });
  followScroll(byId("top-bar"), [...document.querySelectorAll(".top-nav a")]);
  revealOnScroll();
  countWhenSeen();
  if (linkHasResult) runTest();
}

start();
