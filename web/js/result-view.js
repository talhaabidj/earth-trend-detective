// Shows one analysis: verdict, charts and the numbers behind them.
// Used by the explorer (app.js) and by the examples (stories.js).

import { analyse } from "./stats.js";
import { describe } from "./verdict.js";
import { lineChart, monthBars } from "./charts.js";

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

function resultHtml(variable, label, result, text, cells, sourceUrl, compact) {
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
      <h3>${variable.name} · ${label}</h3>
      <span class="muted">${result.first_year}–${result.last_year}, ${result.valid_months} months</span>
    </div>
    <div class="verdict ${text.tone}"><h4>${text.title}</h4><p>${text.body}</p></div>
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
  block.innerHTML = resultHtml(variable, label, result, text, cells, sourceUrl, compact);
  container.appendChild(block);

  const anomalyPoints = rows.map((row, i) => ({
    x: yearFraction(row), y: Number.isFinite(anomalies[i]) ? anomalies[i] : null, label: monthLabel(row),
  }));
  const rawPoints = rows.map((row) => ({ x: yearFraction(row), y: row.value, label: monthLabel(row) }));
  const yearly = yearlyAverages(rows, anomalies);

  function drawCharts() {
    lineChart(block.querySelector('[data-chart="anomalies"]'), {
      points: anomalyPoints, units: variable.units, decimals: variable.decimals, zeroLine: true, yearly,
      trend: { slope: text.rate / 10, low: text.low / 10, high: text.high / 10 },
    });
    if (compact) return;
    lineChart(block.querySelector('[data-chart="raw"]'), {
      points: rawPoints, units: variable.units, decimals: variable.decimals, height: 200,
    });
    monthBars(block.querySelector('[data-chart="months"]'), { usual, units: variable.units, decimals: variable.decimals });
  }
  drawCharts();
  new ResizeObserver(drawCharts).observe(block);
  return { block, result };
}
