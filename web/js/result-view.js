// Shows one analysis: verdict, charts and the numbers behind them.
// Used by the explorer (app.js) and by the examples (stories.js).

import { analyse } from "./stats.js";
import { describe } from "./verdict.js";
import { lineChart, monthBars } from "./charts.js";

// Text from a link (like a place name) must never be read as HTML.
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

const monthLabel = (row) => `${row.year}-${String(row.month).padStart(2, "0")}`;
const yearFraction = (row) => row.year + (row.month - 0.5) / 12;

// Yearly average of the anomalies, only for years with at least 9 of 12 months.
function yearlyAverages(rows, anomalyValues) {
  const years = new Map();
  rows.forEach((row, i) => {
    if (!Number.isFinite(anomalyValues[i])) return;
    const entry = years.get(row.year) || { total: 0, count: 0 };
    entry.total += anomalyValues[i];
    entry.count += 1;
    years.set(row.year, entry);
  });
  return [...years]
    .filter(([, entry]) => entry.count >= 9)
    .map(([year, entry]) => ({ x: year + 0.5, y: entry.total / entry.count, label: String(year) }));
}

// Year, yearly average and yearly anomaly (years with at least 9 months), as an HTML table.
function yearlyTable(rows, anomalyValues, variable) {
  const years = new Map();
  rows.forEach((row, i) => {
    if (row.value === null || !Number.isFinite(anomalyValues[i])) return;
    const entry = years.get(row.year) || { values: 0, anomalies: 0, count: 0 };
    entry.values += row.value;
    entry.anomalies += anomalyValues[i];
    entry.count += 1;
    years.set(row.year, entry);
  });
  const units = variable.units ? ` (${variable.units})` : "";
  const lines = [...years].filter(([, e]) => e.count >= 9).map(([year, e]) =>
    `<tr><td>${year}</td><td>${(e.values / e.count).toFixed(variable.decimals)}</td><td>${(e.anomalies / e.count).toFixed(variable.decimals)}</td></tr>`);
  return `<table class="data-table"><thead><tr><th>Year</th><th>Yearly average${units}</th><th>Difference from usual${units}</th></tr></thead><tbody>${lines.join("")}</tbody></table>`;
}

function resultHtml(variable, label, result, text, cells, sourceUrl, compact, rows, anomalies) {
  const warnings = [variable.caution, ...text.warnings].filter(Boolean);
  const extraCharts = compact ? "" : `
    <div class="chart-block">
      <h5>Raw monthly values</h5>
      <p>What the data looks like before the seasons are removed${variable.units ? ` (${variable.units})` : ""}.</p>
      <div class="chart-box" data-chart="raw"></div>
    </div>
    <div class="chart-block">
      <h5>The usual seasonal cycle</h5>
      <p>The average for each calendar month. This is what gets removed above.</p>
      <div class="chart-box" data-chart="months"></div>
    </div>`;
  return `
    <div class="result-head">
      <h3>${variable.name} · ${escapeHtml(label)}</h3>
      <span class="muted">${result.first_year}–${result.last_year}, ${result.valid_months} months</span>
    </div>
    <div class="verdict ${text.tone}"><h4>${text.title}</h4><p>${text.body}</p></div>
    ${result.verdict === "clear" || result.verdict === "mixed" ? `<p class="note">Testing many variables or places? About 1 test in 20 looks significant by chance, so check a finding against a second variable or the map of nearby places.</p>` : ""}
    ${warnings.length ? `<ul class="warnings">${warnings.map((w) => `<li>${w}</li>`).join("")}</ul>` : ""}
    <div class="chart-block">
      <h5>Seasons removed: is there a trend?</h5>
      <p>Each month minus its usual value for that time of year${variable.units ? ` (${variable.units})` : ""}. Orange line: the trend. Shaded: its 95% range.</p>
      <div class="legend">
        <span><i style="background:var(--series-faint)"></i>each month</span>
        <span><i style="background:var(--series-1)"></i>yearly average</span>
        <span><i style="background:var(--trend)"></i>trend</span>
      </div>
      <div class="chart-box" data-chart="anomalies"></div>
    </div>
    ${extraCharts}
    <details>
      <summary>Show the yearly values as a table</summary>
      <div class="table-scroll">${yearlyTable(rows, anomalies, variable)}</div>
    </details>
    <details>
      <summary>The numbers behind the verdict</summary>
      <ul>${text.numbers.map((n) => `<li>${n}</li>`).join("")}</ul>
    </details>
    <p class="source">Data: ${variable.source}${cells > 1 ? `; average of ${cells} grid cells` : ""}.
      <a href="${sourceUrl}" target="_blank" rel="noopener">See the exact data request</a>.</p>`;
}

export function showResult(container, { rows, variable, label, sourceUrl, cells = 1, compact = false }) {
  const { result, usual, anomalies } = analyse(rows);
  const text = describe(result, variable);

  const block = document.createElement("div");
  block.className = "result";
  block.innerHTML = resultHtml(variable, label, result, text, cells, sourceUrl, compact, rows, anomalies);
  container.appendChild(block);

  const anomalyPoints = rows.map((row, i) => ({
    x: yearFraction(row), y: Number.isFinite(anomalies[i]) ? anomalies[i] : null, label: monthLabel(row),
  }));
  const rawPoints = rows.map((row) => ({ x: yearFraction(row), y: row.value, label: monthLabel(row) }));
  const yearly = yearlyAverages(rows, anomalies);

  const where = `${variable.name} at ${label}, ${result.first_year} to ${result.last_year}`;
  const valid = rows.filter((r) => r.value !== null).map((r) => r.value);
  const highestMonth = usual.indexOf(Math.max(...usual));
  const lowestMonth = usual.indexOf(Math.min(...usual));
  const monthName = (i) => new Date(2000, i, 1).toLocaleString("en", { month: "long" });
  const descriptions = {
    anomalies: `Line chart of monthly differences from usual for ${where}, with yearly averages and a trend line. ${text.title}.`,
    raw: `Line chart of monthly values for ${where}, from ${Math.min(...valid).toFixed(variable.decimals)} to ${Math.max(...valid).toFixed(variable.decimals)}.`,
    months: `Bar chart of the usual value for each month: highest in ${monthName(highestMonth)}, lowest in ${monthName(lowestMonth)}.`,
  };

  function drawCharts() {
    lineChart(block.querySelector('[data-chart="anomalies"]'), {
      points: anomalyPoints, units: variable.units, decimals: variable.decimals, zeroLine: true, yearly,
      trend: { slope: text.rate / 10, low: text.low / 10, high: text.high / 10 }, description: descriptions.anomalies,
    });
    if (compact) return;
    lineChart(block.querySelector('[data-chart="raw"]'), {
      points: rawPoints, units: variable.units, decimals: variable.decimals, height: 200, description: descriptions.raw,
    });
    monthBars(block.querySelector('[data-chart="months"]'), {
      usual, units: variable.units, decimals: variable.decimals, description: descriptions.months,
    });
  }
  drawCharts();
  // Redraw when the width changes; stop watching once the block is removed from the page.
  let lastWidth = block.clientWidth;
  const watcher = new ResizeObserver(() => {
    if (!block.isConnected) {
      watcher.disconnect();
      return;
    }
    if (block.clientWidth !== lastWidth) {
      lastWidth = block.clientWidth;
      drawCharts();
    }
  });
  watcher.observe(block);
  return { block, result };
}
