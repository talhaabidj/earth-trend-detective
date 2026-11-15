// Shows one analysis as a "case file": verdict first, then tabs with the charts, a table and the
// numbers behind the verdict. Used by the explorer (app.js) and by the examples (stories.js).

import { analyse } from "./stats.js";
import { describe, signed } from "./verdict.js";
import { lineChart, monthBars, yearStripes } from "./charts.js";
import { countUp } from "./motion.js";

// Text from a link or a search (like a place name) must never be read as HTML.
export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

const monthLabel = (row) => `${row.year}-${String(row.month).padStart(2, "0")}`;
const yearFraction = (row) => row.year + (row.month - 0.5) / 12;
const monthName = (index) => new Date(2000, index, 1).toLocaleString("en", { month: "long" });

const ARROWS = {
  rising: '<path d="M5 17 L17 5 M9 5 H17 V13"/>',
  falling: '<path d="M5 5 L17 17 M9 17 H17 V9"/>',
  flat: '<path d="M4 11 H18"/>',
};

function arrowIcon(direction) {
  return `<svg viewBox="0 0 22 22" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.6" ` +
    `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ARROWS[direction]}</svg>`;
}

// Year totals of the values and the anomalies, only for years with at least 9 of 12 months.
function yearlySummary(rows, anomalyValues) {
  const years = new Map();
  rows.forEach((row, i) => {
    if (row.value === null || !Number.isFinite(anomalyValues[i])) return;
    const entry = years.get(row.year) || { values: 0, anomalies: 0, count: 0 };
    entry.values += row.value;
    entry.anomalies += anomalyValues[i];
    entry.count += 1;
    years.set(row.year, entry);
  });
  return [...years]
    .filter(([, entry]) => entry.count >= 9)
    .map(([year, entry]) => ({ year, average: entry.values / entry.count, anomaly: entry.anomalies / entry.count }));
}

function yearlyTable(yearly, variable) {
  const units = variable.units ? ` (${variable.units})` : "";
  const lines = yearly.map((y) =>
    `<tr><td>${y.year}</td><td>${y.average.toFixed(variable.decimals)}</td><td>${y.anomaly.toFixed(variable.decimals)}</td></tr>`);
  return `<div class="table-scroll" tabindex="0"><table class="data-table">
    <thead><tr><th>Year</th><th>Yearly average${units}</th><th>Difference from usual${units}</th></tr></thead>
    <tbody>${lines.join("")}</tbody></table></div>`;
}

const TABS = [
  { id: "trend", label: "Trend" },
  { id: "raw", label: "Raw data" },
  { id: "seasons", label: "Seasons" },
  { id: "table", label: "Table" },
  { id: "numbers", label: "The numbers" },
];

function panelHtml(tab, variable, text, yearly) {
  const units = variable.units ? ` (${variable.units})` : "";
  if (tab === "trend") {
    return `<p class="panel-note">Each month minus its usual value for that time of year${units}. This removes the seasons, so only real change is left.</p>
      <div class="legend">
        <span><i style="background:var(--series-faint)"></i>each month</span>
        <span><i style="background:var(--series-1)"></i>yearly average</span>
        <span><i style="background:var(--trend)"></i>trend, with its 95% range shaded</span>
      </div>
      <div class="chart-box" data-chart="trend"></div>`;
  }
  if (tab === "raw") {
    return `<p class="panel-note">The monthly values as NASA provides them${units}, before the seasons are removed.</p>
      <div class="chart-box" data-chart="raw"></div>`;
  }
  if (tab === "seasons") {
    return `<p class="panel-note">The usual value for each calendar month${units}. This seasonal cycle is what gets removed before testing.</p>
      <div class="chart-box" data-chart="seasons"></div>`;
  }
  if (tab === "table") {
    return `<p class="panel-note">Yearly averages, for years with at least 9 months of data.</p>${yearlyTable(yearly, variable)}`;
  }
  return `<ul class="numbers">${text.numbers.map((n) => `<li>${n}</li>`).join("")}</ul>
    <p class="panel-note">A p-value is the chance of seeing a trend this strong if nothing were really changing. Below 0.05 counts as significant.</p>`;
}

let resultCount = 0;

export function showResult(container, { rows, variable, label, sourceUrl, cells = 1 }) {
  const { result, usual, anomalies } = analyse(rows);
  const text = describe(result, variable);
  const id = `result-${++resultCount}`;
  const warnings = text.hasTrend ? [variable.caution, ...text.warnings].filter(Boolean) : [];
  const years = result.valid_months ? `${result.first_year}–${result.last_year} · ${result.valid_months} months of data` : "no data";

  const block = document.createElement("article");
  block.className = "result";
  block.innerHTML = `
    <header class="result-head">
      <p class="result-kicker">${variable.name} · ${years}</p>
      <h3>${escapeHtml(label)}</h3>
    </header>
    <div class="verdict ${text.tone}">
      <div class="verdict-icon">${arrowIcon(text.direction)}</div>
      <div>
        <p class="case-status">${text.status}</p>
        <h4>${text.title}</h4>
        <p>${text.body}</p>
      </div>
    </div>
    ${text.hasTrend ? `
    <div class="tiles">
      ${text.tiles.map((tile, i) => `<div class="tile"><span class="tile-label">${tile.label}</span><span class="tile-value" data-tile="${i}">${tile.text ?? ""}</span></div>`).join("")}
    </div>
    <div class="stripe-box"></div>` : ""}
    ${warnings.length ? `<ul class="warnings">${warnings.map((w) => `<li>${w}</li>`).join("")}</ul>` : ""}
    ${text.hasTrend ? `
    <div class="result-tabs" role="tablist" aria-label="Views of this result">
      ${TABS.map((tab, i) => `<button type="button" role="tab" id="${id}-${tab.id}" data-tab="${tab.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${tab.label}</button>`).join("")}
    </div>
    <div class="result-panel" role="tabpanel" tabindex="0"></div>` : ""}
    <p class="source">Data: ${variable.source}${cells > 1 ? `; average of ${cells} grid cells` : ""}.
      <a href="${sourceUrl}" target="_blank" rel="noopener">See the exact data request</a></p>`;
  container.appendChild(block);
  if (!text.hasTrend) return { block, result };

  const yearly = yearlySummary(rows, anomalies);
  const where = `${variable.name} at ${label}, ${result.first_year} to ${result.last_year}`;
  const valid = rows.filter((r) => r.value !== null).map((r) => r.value);
  const panel = block.querySelector(".result-panel");
  let openTab = "trend";
  const seenTabs = new Set(); // a chart draws itself in only the first time its tab is opened

  const units = variable.units ? ` ${variable.units}` : "";
  text.tiles.forEach((tile, i) => {
    if (tile.value === null) return;
    countUp(block.querySelector(`[data-tile="${i}"]`), tile.value, (n) => `${signed(n, variable.decimals)}${units}`);
  });
  if (yearly.length >= 5) {
    yearStripes(block.querySelector(".stripe-box"), {
      years: yearly.map((y) => ({ year: y.year, anomaly: y.anomaly })), units: variable.units, decimals: variable.decimals, animate: true,
    });
  }

  const charts = {
    trend: (box, animate) => lineChart(box, {
      animate,
      points: rows.map((row, i) => ({ x: yearFraction(row), y: Number.isFinite(anomalies[i]) ? anomalies[i] : null, label: monthLabel(row) })),
      yearly: yearly.map((y) => ({ x: y.year + 0.5, y: y.anomaly, label: String(y.year) })),
      trend: { slope: text.rate / 10, low: text.low / 10, high: text.high / 10 },
      units: variable.units, decimals: variable.decimals, zeroLine: true, height: 260,
      description: `Line chart of monthly differences from usual for ${where}, with yearly averages and a trend line. ${text.title}.`,
    }),
    raw: (box, animate) => lineChart(box, {
      animate,
      points: rows.map((row) => ({ x: yearFraction(row), y: row.value, label: monthLabel(row) })),
      units: variable.units, decimals: variable.decimals, height: 260,
      description: `Line chart of monthly values for ${where}, from ${Math.min(...valid).toFixed(variable.decimals)} to ${Math.max(...valid).toFixed(variable.decimals)}.`,
    }),
    seasons: (box, animate) => monthBars(box, {
      animate,
      usual, units: variable.units, decimals: variable.decimals, height: 240,
      description: `Bar chart of the usual value for each month: highest in ${monthName(usual.indexOf(Math.max(...usual)))}, lowest in ${monthName(usual.indexOf(Math.min(...usual)))}.`,
    }),
  };

  function draw() {
    const box = panel.querySelector("[data-chart]");
    if (!box) return;
    charts[box.dataset.chart](box, !seenTabs.has(openTab));
    seenTabs.add(openTab);
  }

  function open(tab) {
    openTab = tab;
    for (const button of block.querySelectorAll('[role="tab"]')) {
      const selected = button.dataset.tab === tab;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
    panel.setAttribute("aria-labelledby", `${id}-${tab}`);
    panel.innerHTML = panelHtml(tab, variable, text, yearly);
    draw();
  }

  const tabButtons = [...block.querySelectorAll('[role="tab"]')];
  tabButtons.forEach((button, index) => {
    button.addEventListener("click", () => open(button.dataset.tab));
    button.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      const step = event.key === "ArrowRight" ? 1 : -1;
      const next = tabButtons[(index + step + tabButtons.length) % tabButtons.length];
      next.focus();
      open(next.dataset.tab);
    });
  });
  open(openTab);

  // Redraw when the width changes; stop watching once the block is removed from the page.
  let lastWidth = block.clientWidth;
  const watcher = new ResizeObserver(() => {
    if (!block.isConnected) {
      watcher.disconnect();
    } else if (block.clientWidth !== lastWidth) {
      lastWidth = block.clientWidth;
      draw();
    }
  });
  watcher.observe(block);
  return { block, result };
}
