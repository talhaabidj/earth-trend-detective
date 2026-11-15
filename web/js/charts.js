// Small SVG line and bar charts with a hover tooltip. Colours come from css/app.css.

const SVG = "http://www.w3.org/2000/svg";
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MARGIN = { top: 12, right: 16, bottom: 28, left: 52 };

function svgElement(name, attributes, parent) {
  const element = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (parent) parent.appendChild(element);
  return element;
}

const hasValue = (point) => point.y !== null && Number.isFinite(point.y);

// Round tick values (1, 2, 2.5 or 5 times a power of ten) between min and max.
function tickValues(min, max, wanted = 5) {
  const span = max - min || 1;
  const power = 10 ** Math.floor(Math.log10(span / wanted));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => span / s <= wanted);
  const ticks = [];
  for (let t = Math.ceil(min / step) * step; t <= max + step * 1e-9; t += step) ticks.push(Number(t.toFixed(10)));
  return ticks;
}

function tickLabel(value) {
  const size = Math.abs(value);
  if (size >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (size >= 10 || value === 0) return String(Number(value.toFixed(1)));
  return String(Number(value.toFixed(size < 0.1 ? 3 : 2)));
}

// Creates the SVG and works out the drawing area.
function newChart(container, height, description) {
  container.replaceChildren();
  const width = Math.max(container.clientWidth, 280);
  const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}`, width: "100%", height, role: "img", class: "chart", "aria-label": description });
  container.appendChild(svg);
  return {
    svg, width, height,
    left: MARGIN.left, right: width - MARGIN.right, top: MARGIN.top, bottom: height - MARGIN.bottom,
  };
}

function drawAxes(chart, xOf, yOf, xTicks, yTicks, xLabel) {
  const grid = svgElement("g", { class: "grid" }, chart.svg);
  for (const tick of yTicks) {
    svgElement("line", { x1: chart.left, x2: chart.right, y1: yOf(tick), y2: yOf(tick) }, grid);
    const label = svgElement("text", { x: chart.left - 8, y: yOf(tick) + 4, "text-anchor": "end", class: "tick" }, chart.svg);
    label.textContent = tickLabel(tick);
  }
  for (const tick of xTicks) {
    const label = svgElement("text", { x: xOf(tick), y: chart.height - 8, "text-anchor": "middle", class: "tick" }, chart.svg);
    label.textContent = xLabel(tick);
  }
}

// Shows the nearest point's value when the pointer moves over the chart.
function addHover(container, chart, points, xOf, yOf, tooltipHtml) {
  const tooltip = document.createElement("div");
  tooltip.className = "chart-tip";
  tooltip.hidden = true;
  container.appendChild(tooltip);
  const line = svgElement("line", { class: "crosshair", y1: chart.top, y2: chart.bottom }, chart.svg);
  const dot = svgElement("circle", { r: 5, class: "hover-dot" }, chart.svg);
  line.style.display = "none";
  dot.style.display = "none";
  const area = svgElement("rect", {
    x: chart.left, y: chart.top, width: chart.right - chart.left, height: chart.bottom - chart.top, fill: "transparent",
  }, chart.svg);
  const validPoints = points.filter(hasValue);

  function show(event) {
    const box = chart.svg.getBoundingClientRect();
    const x = (event.clientX - box.left) * (chart.width / box.width);
    let nearest = validPoints[0];
    for (const point of validPoints) {
      if (Math.abs(xOf(point.x) - x) < Math.abs(xOf(nearest.x) - x)) nearest = point;
    }
    const px = xOf(nearest.x);
    const py = yOf(nearest.y);
    line.setAttribute("x1", px);
    line.setAttribute("x2", px);
    dot.setAttribute("cx", px);
    dot.setAttribute("cy", py);
    line.style.display = "";
    dot.style.display = "";
    tooltip.innerHTML = tooltipHtml(nearest);
    tooltip.hidden = false;
    const left = (px / chart.width) * box.width;
    tooltip.style.left = `${Math.min(Math.max(left, 60), box.width - 60)}px`;
    tooltip.style.top = `${(py / chart.height) * box.height - 12}px`;
  }
  function hide() {
    tooltip.hidden = true;
    line.style.display = "none";
    dot.style.display = "none";
  }
  area.addEventListener("pointermove", show);
  area.addEventListener("pointerdown", show);
  area.addEventListener("pointerleave", hide);
}

// A line through the points, broken where months are missing.
function linePath(points, xOf, yOf) {
  let path = "";
  let penDown = false;
  for (const point of points) {
    if (!hasValue(point)) {
      penDown = false;
      continue;
    }
    path += `${penDown ? "L" : "M"}${xOf(point.x).toFixed(1)},${yOf(point.y).toFixed(1)}`;
    penDown = true;
  }
  return path;
}

// points: [{x: year with fraction, y, label}]
// trend (optional): {slope, low, high} per year, drawn through y = 0 at the middle of the record,
//   with the range between the low and high slopes shaded.
// yearly (optional): yearly averages drawn as dots on top of a faded monthly line.
export function lineChart(container, { points, units, decimals = 2, height = 240, zeroLine = false, trend = null, yearly = null, description = "", animate = false }) {
  const chart = newChart(container, height, description);
  if (animate) chart.svg.classList.add("animate");
  const valid = points.filter(hasValue);
  if (!valid.length) return;

  const firstX = points[0].x;
  const lastX = points[points.length - 1].x;
  let minY = Math.min(...valid.map((p) => p.y));
  let maxY = Math.max(...valid.map((p) => p.y));
  if (zeroLine) {
    minY = Math.min(minY, 0);
    maxY = Math.max(maxY, 0);
  }
  const padding = (maxY - minY) * 0.08 || 1;
  minY -= padding;
  maxY += padding;

  const xOf = (x) => chart.left + ((x - firstX) / (lastX - firstX || 1)) * (chart.right - chart.left);
  const yOf = (y) => chart.top + (1 - (y - minY) / (maxY - minY)) * (chart.bottom - chart.top);

  const firstYear = Math.ceil(firstX);
  const lastYear = Math.floor(lastX);
  const maxLabels = Math.max(3, (chart.right - chart.left) / 80);
  const yearStep = [1, 2, 5, 10, 20].find((step) => (lastYear - firstYear) / step <= maxLabels) || 20;
  const yearTicks = [];
  for (let year = Math.ceil(firstYear / yearStep) * yearStep; year <= lastYear; year += yearStep) yearTicks.push(year);
  drawAxes(chart, xOf, yOf, yearTicks, tickValues(minY, maxY), String);

  if (zeroLine) svgElement("line", { class: "zero", x1: chart.left, x2: chart.right, y1: yOf(0), y2: yOf(0) }, chart.svg);

  if (trend && Number.isFinite(trend.slope)) {
    const middleX = (firstX + lastX) / 2;
    const at = (slope, x) => slope * (x - middleX);
    if (Number.isFinite(trend.low) && Number.isFinite(trend.high)) {
      const corners = [
        [firstX, at(trend.high, firstX)], [middleX, 0], [lastX, at(trend.high, lastX)],
        [lastX, at(trend.low, lastX)], [middleX, 0], [firstX, at(trend.low, firstX)],
      ];
      svgElement("polygon", { points: corners.map(([x, y]) => `${xOf(x)},${yOf(y)}`).join(" "), class: "trend-band" }, chart.svg);
    }
    // pathLength 1 lets the stylesheet draw the line in from left to right.
    svgElement("path", {
      class: "trend-line", pathLength: 1,
      d: `M${xOf(firstX)},${yOf(at(trend.slope, firstX))}L${xOf(lastX)},${yOf(at(trend.slope, lastX))}`,
    }, chart.svg);
  }

  svgElement("path", { d: linePath(points, xOf, yOf), class: yearly ? "series-line faded" : "series-line" }, chart.svg);

  if (yearly) {
    svgElement("path", { d: linePath(yearly, xOf, yOf), class: "yearly-line", pathLength: 1 }, chart.svg);
    for (const point of yearly.filter(hasValue)) {
      svgElement("circle", { cx: xOf(point.x), cy: yOf(point.y), r: 3.5, class: "yearly-dot" }, chart.svg);
    }
  }

  addHover(container, chart, points, xOf, yOf, (p) => `<strong>${p.label}</strong><br>${p.y.toFixed(decimals)} ${units}`);
}

// Twelve bars, one per calendar month. usual[0] is January.
export function monthBars(container, { usual, units, decimals = 2, height = 180, description = "", animate = false }) {
  const chart = newChart(container, height, description);
  if (animate) chart.svg.classList.add("animate");
  const values = usual.filter(Number.isFinite);
  let minY = Math.min(0, ...values);
  let maxY = Math.max(0, ...values);
  const padding = (maxY - minY) * 0.08 || 1;
  if (maxY > 0) maxY += padding;
  if (minY < 0) minY -= padding;

  const slot = (chart.right - chart.left) / 12;
  const barWidth = Math.min(24, slot * 0.6);
  const xOf = (month) => chart.left + slot * (month + 0.5);
  const yOf = (y) => chart.top + (1 - (y - minY) / (maxY - minY)) * (chart.bottom - chart.top);
  const narrow = chart.right - chart.left < 360;
  drawAxes(chart, xOf, yOf, [...Array(12).keys()], tickValues(minY, maxY, 4), (m) => (narrow ? MONTH_NAMES[m][0] : MONTH_NAMES[m]));

  usual.forEach((value, month) => {
    if (!Number.isFinite(value)) return;
    const base = yOf(0);
    const end = yOf(value);
    const barHeight = Math.max(1, Math.abs(end - base));
    const radius = Math.min(4, barHeight / 2, barWidth / 2);
    const x = xOf(month) - barWidth / 2;
    // Rounded at the value end, square at the zero line.
    const path = value >= 0
      ? `M${x},${base}V${end + radius}Q${x},${end} ${x + radius},${end}H${x + barWidth - radius}Q${x + barWidth},${end} ${x + barWidth},${end + radius}V${base}Z`
      : `M${x},${base}V${end - radius}Q${x},${end} ${x + radius},${end}H${x + barWidth - radius}Q${x + barWidth},${end} ${x + barWidth},${end - radius}V${base}Z`;
    svgElement("path", { d: path, class: "season-bar" }, chart.svg);
  });

  const points = usual.map((value, month) => ({ x: month, y: value, label: MONTH_NAMES[month] }));
  addHover(container, chart, points, xOf, yOf, (p) => `<strong>${p.label}</strong><br>usually ${p.y.toFixed(decimals)} ${units}`);
}

// Nine colours from "well below usual" (blue) through neutral to "well above usual" (red).
const STRIPE_COLOURS = ["#184f95", "#2a78d6", "#6da7ec", "#b7d3f6", "var(--stripe-middle)", "#f3c2bd", "#eb8a82", "#e34948", "#a8302f"];

// One stripe per year, coloured by how far that year was from usual. Inspired by Ed Hawkins's
// warming stripes (showyourstripes.info); drawn here from this place's own NASA data.
// years: [{year, anomaly}]
export function yearStripes(container, { years, units, decimals = 2, animate = false }) {
  container.replaceChildren();
  const biggest = Math.max(...years.map((y) => Math.abs(y.anomaly)), 1e-9);
  const band = document.createElement("div");
  band.className = animate ? "stripes animate" : "stripes";
  band.setAttribute("role", "img");
  const first = years[0];
  const last = years[years.length - 1];
  band.setAttribute("aria-label", `One stripe per year from ${first.year} to ${last.year}: blue years were below usual, red years above. ` +
    `${first.year} was ${first.anomaly.toFixed(decimals)} and ${last.year} was ${last.anomaly.toFixed(decimals)} ${units} from usual.`);
  years.forEach((y, index) => {
    const stripe = document.createElement("span");
    const step = Math.round((y.anomaly / biggest) * 4) + 4;
    stripe.style.background = STRIPE_COLOURS[Math.min(8, Math.max(0, step))];
    stripe.style.setProperty("--order", index);
    stripe.title = `${y.year}: ${y.anomaly > 0 ? "+" : ""}${y.anomaly.toFixed(decimals)} ${units} from usual`.trim();
    band.appendChild(stripe);
  });
  const labels = document.createElement("div");
  labels.className = "stripe-labels";
  labels.innerHTML = `<span>${first.year}</span><span>each stripe is one year: <i class="below"></i> below usual <i class="above"></i> above usual</span><span>${last.year}</span>`;
  container.append(band, labels);
}
