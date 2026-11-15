// "Where is it changing?" Tests every POWER grid cell in an area and colours it on a map.
// With 100-300 tests at once, about 1 in 20 would look significant by chance, so a cell only
// counts as a clear trend if it passes the Benjamini-Hochberg false discovery check.

import { analyse } from "./stats.js";
import { getAreaCells } from "./power.js";
import { signed } from "./verdict.js";

const RISING = ["#f3c2bd", "#eb8a82", "#e34948", "#a8302f"];
const FALLING = ["#c3dbf8", "#7fb0ee", "#2a78d6", "#184f95"];
const NO_TREND = "#bdbcb6";
const HALF_CELL = { lat: 0.25, lon: 0.3125 }; // POWER cells are 0.5° x 0.625°

// Benjamini-Hochberg: true for each p-value that still counts as significant at this rate.
export function passesFalseDiscoveryCheck(pValues, rate = 0.05) {
  const order = pValues.map((p, i) => i).sort((a, b) => pValues[a] - pValues[b]);
  let lastPassingRank = 0;
  order.forEach((index, i) => {
    if (pValues[index] <= rate * (i + 1) / pValues.length) lastPassingRank = i + 1;
  });
  const passing = new Array(pValues.length).fill(false);
  order.forEach((index, i) => { passing[index] = i + 1 <= lastPassingRank; });
  return passing;
}

// Decide each cell's class: clear rise/fall (both tests pass the check), maybe, or no clear trend.
function classifyCells(cells) {
  // A cell with no usable test counts as p = 1 (never significant).
  const usable = (p) => (Number.isFinite(p) ? p : 1);
  const mkPasses = passesFalseDiscoveryCheck(cells.map((c) => usable(c.result.mk_p)));
  const linePasses = passesFalseDiscoveryCheck(cells.map((c) => usable(c.result.line_p)));
  cells.forEach((cell, i) => {
    const rising = cell.rate > 0;
    if (!Number.isFinite(cell.rate) || cell.result.verdict === "too_short") cell.kind = "no_data";
    else if (mkPasses[i] && linePasses[i]) cell.kind = rising ? "clear_rise" : "clear_fall";
    else if (mkPasses[i] || linePasses[i]) cell.kind = rising ? "maybe_rise" : "maybe_fall";
    else cell.kind = "no_trend";
  });
}

function cellColour(cell, biggestRate) {
  if (cell.kind === "no_trend" || cell.kind === "no_data") return NO_TREND;
  const ramp = cell.rate > 0 ? RISING : FALLING;
  if (cell.kind.startsWith("maybe")) return ramp[0];
  const step = Math.min(2, Math.floor((Math.abs(cell.rate) / biggestRate) * 3));
  return ramp[step + 1];
}

const KIND_TEXT = {
  clear_rise: "clear rise",
  clear_fall: "clear fall",
  maybe_rise: "maybe rising (tests disagree)",
  maybe_fall: "maybe falling (tests disagree)",
  no_trend: "no clear trend",
  no_data: "not enough data",
};

function legendHtml(variable, biggestRate) {
  const units = variable.units ? ` ${variable.units}` : "";
  const third = (n) => signed(n * biggestRate / 3, variable.decimals).replace("+", "");
  const swatch = (colour, text) => `<span><i style="background:${colour}"></i>${text}</span>`;
  return `
    <div class="map-legend">
      <strong>Rate per decade${units ? ` (${units.trim()})` : ""}:</strong>
      ${swatch(FALLING[3], `falling more than ${third(2)}`)}
      ${swatch(FALLING[2], `falling ${third(1)} to ${third(2)}`)}
      ${swatch(FALLING[1], `falling less than ${third(1)}`)}
      ${swatch(FALLING[0], "maybe falling")}
      ${swatch(NO_TREND, "no clear trend")}
      ${swatch(RISING[0], "maybe rising")}
      ${swatch(RISING[1], `rising less than ${third(1)}`)}
      ${swatch(RISING[2], `rising ${third(1)} to ${third(2)}`)}
      ${swatch(RISING[3], `rising more than ${third(2)}`)}
    </div>`;
}

function summaryText(cells, variable) {
  const count = (kind) => cells.filter((c) => c.kind === kind).length;
  const rises = count("clear_rise");
  const falls = count("clear_fall");
  const maybes = count("maybe_rise") + count("maybe_fall");
  const none = count("no_trend");
  const noData = count("no_data");
  let text = `Of ${cells.length} grid cells, ${rises} show a clear rise in ${variable.name.toLowerCase()}, ` +
    `${falls} a clear fall, ${maybes} a "maybe", and ${none} no clear trend.`;
  if (noData) text += ` ${noData} have no usable data (for example open ocean for a land variable).`;
  if (rises && falls) text += " The same variable is moving in opposite directions within this area.";
  return text;
}

// Draws the map layer. onCellClick(lat, lon) is called when a cell is clicked.
export async function mapTrends(map, layerGroup, variable, box, onCellClick) {
  const { cells: rawCells, url } = await getAreaCells(variable.id, box, variable.startYear);
  const cells = rawCells.map((cell) => {
    const { result } = analyse(cell.rows);
    const useLine = result.warnings.includes("median_slope_zero");
    return { ...cell, result, rate: 10 * (useLine ? result.line_slope : result.sen_slope) };
  });
  classifyCells(cells);
  // The colour scale runs up to the fastest clear trend (or the fastest of any, if none is clear).
  const clearCells = cells.filter((c) => c.kind.startsWith("clear"));
  const rates = (clearCells.length ? clearCells : cells).map((c) => Math.abs(c.rate)).filter(Number.isFinite);
  const biggestRate = Math.max(...rates, 1e-9);

  layerGroup.clearLayers();
  for (const cell of cells) {
    const bounds = [[cell.lat - HALF_CELL.lat, cell.lon - HALF_CELL.lon], [cell.lat + HALF_CELL.lat, cell.lon + HALF_CELL.lon]];
    const rectangle = L.rectangle(bounds, { stroke: true, color: "#ffffff", weight: 0.5, fillColor: cellColour(cell, biggestRate), fillOpacity: 0.78 });
    const units = variable.units ? ` ${variable.units}` : "";
    const rateLine = Number.isFinite(cell.rate) ? `${signed(cell.rate, variable.decimals)}${units} per decade<br>` : "";
    rectangle.bindTooltip(`${cell.lat.toFixed(2)}°, ${cell.lon.toFixed(2)}°<br>${rateLine}${KIND_TEXT[cell.kind]}`);
    rectangle.on("click", () => onCellClick(cell.lat, cell.lon));
    layerGroup.addLayer(rectangle);
  }
  map.fitBounds([[box.south, box.west], [box.north, box.east]]);
  return { summary: summaryText(cells, variable), legend: legendHtml(variable, biggestRate), url, cells };
}
