// SI-assisted: written with Claude Code (Anthropic) under the team's direction; see docs/AI_USE.md.
// Page logic: choose a place and a variable, fetch NASA POWER data, test for a trend, show it.

import { THEMES, VARIABLES, PLACE_TYPES, findVariable } from "./catalogue.js";
import { fetchSeries, boxAround } from "./power.js";
import { analyse } from "./stats.js";
import { describe } from "./verdict.js";
import { timeSeriesChart, seasonChart } from "./charts.js";
import { initStories } from "./stories.js";

const PRESETS = [
  { name: "Lahore", lat: 31.55, lon: 74.34 },
  { name: "Jacobabad", lat: 28.28, lon: 68.44 },
  { name: "Karachi", lat: 24.86, lon: 67.01 },
  { name: "Hunza", lat: 36.32, lon: 74.65 },
  { name: "Phoenix", lat: 33.45, lon: -112.07 },
  { name: "Manaus", lat: -3.12, lon: -60.02 },
  { name: "Svalbard", lat: 78.22, lon: 15.65 },
  { name: "Niamey", lat: 13.51, lon: 2.11 },
];

const state = {
  lat: 31.55, lon: 74.34, placeName: "Lahore", area: "cell",
  theme: "heat", variableId: "T2M", suggested: [], lastResult: null,
};

const $ = (id) => document.getElementById(id);
let map, marker;

function readUrl() {
  const q = new URLSearchParams(location.search);
  if (q.has("lat") && q.has("lon")) {
    state.lat = clampLat(+q.get("lat"));
    state.lon = wrapLon(+q.get("lon"));
    state.placeName = q.get("name") || "";
  }
  if (q.get("v") && findVariable(q.get("v"))) {
    state.variableId = q.get("v");
    state.theme = findVariable(state.variableId).theme;
  }
  if (q.get("area") === "box") state.area = "box";
  return q.has("lat") && q.has("v");
}

function writeUrl() {
  const q = new URLSearchParams({ lat: state.lat.toFixed(2), lon: state.lon.toFixed(2), v: state.variableId, area: state.area });
  if (state.placeName) q.set("name", state.placeName);
  history.replaceState(null, "", `?${q}${location.hash}`);
}

const clampLat = (v) => Math.min(89, Math.max(-89, Number.isFinite(v) ? v : 0));
const wrapLon = (v) => (Number.isFinite(v) ? ((((v + 180) % 360) + 360) % 360) - 180 : 0);

function placeLabel() {
  const coords = `${Math.abs(state.lat).toFixed(2)}°${state.lat >= 0 ? "N" : "S"}, ${Math.abs(state.lon).toFixed(2)}°${state.lon >= 0 ? "E" : "W"}`;
  return state.placeName ? `${state.placeName} (${coords})` : coords;
}

function setPlace(lat, lon, name = "") {
  state.lat = clampLat(lat);
  state.lon = wrapLon(lon);
  state.placeName = name;
  $("lat").value = state.lat.toFixed(2);
  $("lon").value = state.lon.toFixed(2);
  if (map) {
    marker.setLatLng([state.lat, state.lon]);
    drawBox();
  }
  document.querySelectorAll("#presets .chip").forEach((chip) =>
    chip.setAttribute("aria-pressed", String(chip.dataset.name === name)));
}

let boxLayer;
function drawBox() {
  if (boxLayer) boxLayer.remove();
  if (state.area !== "box" || !map) return;
  const b = boxAround(state.lat, state.lon);
  boxLayer = L.rectangle([[b.south, b.west], [b.north, b.east]], { color: "#2a78d6", weight: 2, fillOpacity: 0.08 }).addTo(map);
}

function initMap() {
  if (!window.L) {
    $("map").textContent = "The map could not load. Type a latitude and longitude instead.";
    return;
  }
  map = L.map("map", { worldCopyJump: true }).setView([state.lat, state.lon], 4);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 12,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  marker = L.marker([state.lat, state.lon], { keyboard: false }).addTo(map);
  map.on("click", (e) => setPlace(e.latlng.lat, e.latlng.lng));
  drawBox();
}

function initPlaceControls() {
  const presets = $("presets");
  for (const p of PRESETS) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.dataset.name = p.name;
    chip.textContent = p.name;
    chip.addEventListener("click", () => {
      setPlace(p.lat, p.lon, p.name);
      if (map) map.setView([p.lat, p.lon], 5);
    });
    presets.appendChild(chip);
  }
  const onCoords = () => setPlace(+$("lat").value, +$("lon").value);
  $("lat").addEventListener("change", onCoords);
  $("lon").addEventListener("change", onCoords);
  document.querySelectorAll('input[name="area"]').forEach((radio) => {
    radio.checked = radio.value === state.area;
    radio.addEventListener("change", () => { state.area = radio.value; drawBox(); });
  });
  setPlace(state.lat, state.lon, state.placeName);
}

function renderThemes() {
  const tabs = $("themes");
  tabs.replaceChildren();
  for (const t of THEMES) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "tab";
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", String(t.id === state.theme));
    tab.textContent = t.question;
    tab.addEventListener("click", () => { state.theme = t.id; renderThemes(); renderVariables(); });
    tabs.appendChild(tab);
  }
}

function renderVariables() {
  const grid = $("variables");
  grid.replaceChildren();
  for (const v of VARIABLES.filter((x) => x.theme === state.theme || state.suggested.includes(x.id))) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "variable-card" + (state.suggested.includes(v.id) ? " suggested" : "");
    card.setAttribute("aria-pressed", String(v.id === state.variableId));
    card.innerHTML = `<strong>${v.name}</strong><span>${v.plain}</span>`;
    card.title = v.why;
    card.addEventListener("click", () => { state.variableId = v.id; renderVariables(); });
    grid.appendChild(card);
  }
}

function initPlaceTypes() {
  const select = $("place-type");
  for (const t of PLACE_TYPES) {
    const option = document.createElement("option");
    option.value = t.id;
    option.textContent = t.label;
    select.appendChild(option);
  }
  select.addEventListener("change", () => {
    const type = PLACE_TYPES.find((t) => t.id === select.value);
    state.suggested = type ? type.suggest : [];
    $("place-type-reason").textContent = type ? `${type.reason} Suggested variables are marked below.` : "";
    if (type) state.variableId = type.suggest[0];
    renderVariables();
  });
}

function toCsv(series, variable, label) {
  const lines = [`# ${variable.name} (${variable.id}), ${variable.units}, ${label}`, "# Source: NASA POWER, https://power.larc.nasa.gov/", "year,month,value"];
  for (const d of series) lines.push(`${d.year},${d.month},${d.value ?? ""}`);
  return lines.join("\n");
}

// Yearly mean of the anomalies, only for years with at least 9 of 12 months.
function yearlyMeans(series, anomalies) {
  const byYear = new Map();
  series.forEach((d, i) => {
    if (!Number.isFinite(anomalies[i])) return;
    const entry = byYear.get(d.year) || { sum: 0, count: 0 };
    entry.sum += anomalies[i]; entry.count += 1;
    byYear.set(d.year, entry);
  });
  return [...byYear].filter(([, e]) => e.count >= 9)
    .map(([year, e]) => ({ x: year + 0.5, y: e.sum / e.count, label: String(year) }));
}

// Renders one analysis block. Used by the explorer and by the example player.
export function renderAnalysis(container, { series, variable, label, sourceUrl, cells, compact = false }) {
  const times = series.map((d) => [d.year, d.month]);
  const values = series.map((d) => d.value);
  const { result, climatology, anomalies } = analyse(times, values);
  const text = describe(result, variable);
  const block = document.createElement("div");
  block.className = "result";
  block.innerHTML = `
    <div class="result-head"><h3>${variable.name} · ${label}</h3>
      <span class="muted">${result.first_year}–${result.last_year}, ${result.n_valid} months</span></div>
    <div class="verdict ${text.tone}"><h4>${text.title}</h4><p>${text.body}</p></div>
    ${text.warnings.length || variable.caution ? `<ul class="warnings">${[variable.caution, ...text.warnings].filter(Boolean).map((w) => `<li>${w}</li>`).join("")}</ul>` : ""}
    <div class="chart-block"><h5>Seasons removed: is there a trend?</h5>
      <p>Each month minus its usual value for that time of year (${variable.units}). Orange line: trend; shaded: its 95% range.</p>
      <div class="legend"><span><i style="background:var(--series-faint)"></i>each month</span><span><i style="background:var(--series-1)"></i>yearly average</span><span><i style="background:var(--trend)"></i>trend</span></div>
      <div class="chart-box" data-chart="anomaly"></div></div>
    ${compact ? "" : `
    <div class="chart-block"><h5>Raw monthly values</h5><p>What the data looks like before seasons are removed (${variable.units}).</p>
      <div class="chart-box" data-chart="raw"></div></div>
    <div class="chart-block"><h5>The usual seasonal cycle</h5><p>Average for each calendar month. This is what gets removed above.</p>
      <div class="chart-box" data-chart="season"></div></div>`}
    <details><summary>The numbers behind the verdict</summary><ul>${text.details.map((d) => `<li>${d}</li>`).join("")}</ul></details>
    <p class="source">Data: NASA POWER, ${variable.id} from ${variable.source}${cells > 1 ? `; average of ${cells} grid cells` : ""}.
      <a href="${sourceUrl}" target="_blank" rel="noopener">Exact data request</a>.</p>`;
  container.appendChild(block);

  const points = series.map((d, i) => ({ x: d.year + (d.month - 0.5) / 12, y: Number.isFinite(anomalies[i]) ? anomalies[i] : null, label: `${d.year}-${String(d.month).padStart(2, "0")}` }));
  const trendSlope = text.rate / 10;
  const draw = () => {
    timeSeriesChart(block.querySelector('[data-chart="anomaly"]'), {
      points, units: variable.units, decimals: variable.decimals, zeroLine: true,
      trend: { slope: trendSlope, low: text.low / 10, high: text.high / 10, centre: 0 },
      yearly: yearlyMeans(series, anomalies),
    });
    if (!compact) {
      timeSeriesChart(block.querySelector('[data-chart="raw"]'), {
        points: series.map((d) => ({ x: d.year + (d.month - 0.5) / 12, y: d.value, label: `${d.year}-${String(d.month).padStart(2, "0")}` })),
        units: variable.units, decimals: variable.decimals, height: 200,
      });
      seasonChart(block.querySelector('[data-chart="season"]'), { climatology, units: variable.units, decimals: variable.decimals });
    }
  };
  draw();
  new ResizeObserver(() => draw()).observe(block);
  return { block, result };
}

async function runAnalysis(target, place, label) {
  const variable = findVariable(state.variableId);
  const { series, url, cells } = await fetchSeries(variable.id, place, variable.startYear);
  const { block, result } = renderAnalysis(target, { series, variable, label, sourceUrl: url, cells });
  return { block, result, series, variable };
}

function currentPlace() {
  return state.area === "box" ? { box: boxAround(state.lat, state.lon) } : { lat: state.lat, lon: state.lon };
}

async function onRun() {
  const button = $("run"), status = $("status"), results = $("results");
  button.disabled = true;
  status.className = "status";
  status.textContent = "Asking NASA POWER for the data…";
  writeUrl();
  try {
    results.replaceChildren();
    results.hidden = false;
    const grid = document.createElement("div");
    grid.className = "compare-grid";
    results.appendChild(grid);
    const label = placeLabel() + (state.area === "box" ? ", 2° area" : "");
    const run = await runAnalysis(grid, currentPlace(), label);
    state.lastResult = { ...run, label };
    addActions(results, grid, run, label);
    status.textContent = "";
    run.block.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    status.className = "status error";
    status.textContent = `Could not get the data: ${error.message} Try again, or watch an example above.`;
  } finally {
    button.disabled = false;
  }
}

function addActions(results, grid, run, label) {
  const actions = document.createElement("div");
  actions.className = "actions";
  const csv = document.createElement("button");
  csv.className = "secondary";
  csv.type = "button";
  csv.textContent = "Download data (CSV)";
  csv.addEventListener("click", () => {
    const blob = new Blob([toCsv(run.series, run.variable, label)], { type: "text/csv" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${run.variable.id}_${state.lat.toFixed(2)}_${state.lon.toFixed(2)}.csv` });
    a.click();
    URL.revokeObjectURL(a.href);
  });
  const compare = document.createElement("button");
  compare.className = "secondary";
  compare.type = "button";
  compare.textContent = "Compare with another place";
  compare.addEventListener("click", () => {
    $("status").textContent = "Choose a second place on the map, then press “Add to comparison”.";
    compare.textContent = "Add to comparison";
    compare.onclick = async () => {
      compare.disabled = true;
      try {
        grid.classList.add("two");
        state.variableId = run.variable.id;
        await runAnalysis(grid, currentPlace(), placeLabel() + (state.area === "box" ? ", 2° area" : ""));
        $("status").textContent = "";
        compare.remove();
      } catch (error) {
        $("status").textContent = `Could not get the data: ${error.message}`;
        compare.disabled = false;
      }
    };
    $("explore").scrollIntoView({ behavior: "smooth" });
  }, { once: true });
  const share = document.createElement("button");
  share.className = "secondary";
  share.type = "button";
  share.textContent = "Copy link to this result";
  share.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(location.href); share.textContent = "Link copied"; } catch { share.textContent = location.href; }
  });
  actions.append(csv, compare, share);
  results.appendChild(actions);
}

function init() {
  const autoRun = readUrl();
  initMap();
  initPlaceControls();
  initPlaceTypes();
  renderThemes();
  renderVariables();
  $("run").addEventListener("click", onRun);
  initStories($("story-list"), $("story-player"), renderAnalysis);
  if (autoRun) onRun();
}

init();
