// SI-assisted: written with Claude Code (Anthropic) under the team's direction; see docs/AI_USE.md.
// Small SVG charts with a hover tooltip. Colours come from CSS variables in css/app.css.

const SVG_NS = "http://www.w3.org/2000/svg";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function el(name, attrs = {}, parent) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

function niceTicks(min, max, count = 5) {
  const span = max - min || 1;
  const step0 = span / count;
  const power = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => span / s <= count) || step0;
  const ticks = [];
  for (let t = Math.ceil(min / step) * step; t <= max + step * 1e-9; t += step) ticks.push(+t.toFixed(10));
  return ticks;
}

function formatTick(value) {
  const abs = Math.abs(value);
  if (abs >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (abs >= 10 || value === 0) return String(+value.toFixed(1));
  return String(+value.toFixed(abs < 0.1 ? 3 : 2));
}

function frame(container, height) {
  container.replaceChildren();
  const width = Math.max(container.clientWidth, 280);
  const margin = { top: 12, right: 16, bottom: 28, left: 52 };
  const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, width: "100%", height, role: "img", class: "chart" });
  container.appendChild(svg);
  return { svg, width, height, margin, innerW: width - margin.left - margin.right, innerH: height - margin.top - margin.bottom };
}

function drawAxes(f, xScale, yScale, xTicks, yTicks, xFormat) {
  const grid = el("g", { class: "grid" }, f.svg);
  for (const t of yTicks) {
    const y = yScale(t);
    el("line", { x1: f.margin.left, x2: f.width - f.margin.right, y1: y, y2: y }, grid);
    const label = el("text", { x: f.margin.left - 8, y: y + 4, "text-anchor": "end", class: "tick" }, f.svg);
    label.textContent = formatTick(t);
  }
  for (const t of xTicks) {
    const label = el("text", { x: xScale(t), y: f.height - 8, "text-anchor": "middle", class: "tick" }, f.svg);
    label.textContent = xFormat(t);
  }
}

function addTooltip(container, f, points, xScale, yScale, describePoint) {
  const tip = document.createElement("div");
  tip.className = "chart-tip";
  tip.hidden = true;
  container.appendChild(tip);
  const cross = el("line", { class: "crosshair", y1: f.margin.top, y2: f.height - f.margin.bottom }, f.svg);
  const dot = el("circle", { r: 5, class: "hover-dot" }, f.svg);
  cross.style.display = dot.style.display = "none";
  const hit = el("rect", { x: f.margin.left, y: f.margin.top, width: f.innerW, height: f.innerH, fill: "transparent" }, f.svg);
  const valid = points.filter((p) => p.y !== null && Number.isFinite(p.y));

  function show(clientX) {
    const box = f.svg.getBoundingClientRect();
    const x = (clientX - box.left) * (f.width / box.width);
    let best = valid[0], bestDist = Infinity;
    for (const p of valid) {
      const dist = Math.abs(xScale(p.x) - x);
      if (dist < bestDist) { best = p; bestDist = dist; }
    }
    if (!best) return;
    const px = xScale(best.x), py = yScale(best.y);
    cross.setAttribute("x1", px); cross.setAttribute("x2", px);
    dot.setAttribute("cx", px); dot.setAttribute("cy", py);
    cross.style.display = dot.style.display = "";
    tip.innerHTML = describePoint(best);
    tip.hidden = false;
    const left = (px / f.width) * box.width;
    tip.style.left = `${Math.min(Math.max(left, 60), box.width - 60)}px`;
    tip.style.top = `${(py / f.height) * box.height - 12}px`;
  }
  function hide() { tip.hidden = true; cross.style.display = dot.style.display = "none"; }
  hit.addEventListener("pointermove", (e) => show(e.clientX));
  hit.addEventListener("pointerdown", (e) => show(e.clientX));
  hit.addEventListener("pointerleave", hide);
}

// points: [{x: decimal year, y, label}]. trend: {slope, intercept, low, high} in units per year,
// drawn as a line through the data's centre with a shaded 95% range of slopes.
// yearly: optional [{x, y, label}] drawn as dots joined by a line on top of the faded monthly line.
export function timeSeriesChart(container, { points, trend, units, decimals = 2, height = 240, zeroLine = false, yearly = null }) {
  const f = frame(container, height);
  const valid = points.filter((p) => p.y !== null && Number.isFinite(p.y));
  if (!valid.length) return;
  const xMin = points[0].x, xMax = points[points.length - 1].x;
  let yMin = Math.min(...valid.map((p) => p.y)), yMax = Math.max(...valid.map((p) => p.y));
  if (zeroLine) { yMin = Math.min(yMin, 0); yMax = Math.max(yMax, 0); }
  const pad = (yMax - yMin) * 0.08 || 1;
  yMin -= pad; yMax += pad;
  const xScale = (x) => f.margin.left + ((x - xMin) / (xMax - xMin || 1)) * f.innerW;
  const yScale = (y) => f.margin.top + (1 - (y - yMin) / (yMax - yMin)) * f.innerH;
  const firstYear = Math.ceil(xMin), lastYear = Math.floor(xMax);
  const yearStep = [1, 2, 5, 10, 20].find((s) => (lastYear - firstYear) / s <= Math.max(3, f.innerW / 80)) || 20;
  const xTicks = [];
  for (let y = Math.ceil(firstYear / yearStep) * yearStep; y <= lastYear; y += yearStep) xTicks.push(y);
  drawAxes(f, xScale, yScale, xTicks, niceTicks(yMin, yMax), (t) => String(t));

  if (zeroLine) el("line", { class: "zero", x1: f.margin.left, x2: f.width - f.margin.right, y1: yScale(0), y2: yScale(0) }, f.svg);

  if (trend && Number.isFinite(trend.slope)) {
    const xMid = valid.reduce((a, p) => a + p.x, 0) / valid.length;
    const yMid = trend.centre ?? valid.reduce((a, p) => a + p.y, 0) / valid.length;
    const at = (slope, x) => yMid + slope * (x - xMid);
    if (Number.isFinite(trend.low) && Number.isFinite(trend.high)) {
      const band = [
        [xMin, at(trend.high, xMin)], [xMid, yMid], [xMax, at(trend.high, xMax)],
        [xMax, at(trend.low, xMax)], [xMid, yMid], [xMin, at(trend.low, xMin)],
      ].map(([x, y]) => `${xScale(x)},${yScale(y)}`).join(" ");
      el("polygon", { points: band, class: "trend-band" }, f.svg);
    }
    el("line", { class: "trend-line", x1: xScale(xMin), y1: yScale(at(trend.slope, xMin)), x2: xScale(xMax), y2: yScale(at(trend.slope, xMax)) }, f.svg);
  }

  // Break the line at missing months instead of joining across gaps.
  let d = "", pen = false;
  for (const p of points) {
    if (p.y === null || !Number.isFinite(p.y)) { pen = false; continue; }
    d += `${pen ? "L" : "M"}${xScale(p.x).toFixed(1)},${yScale(p.y).toFixed(1)}`;
    pen = true;
  }
  el("path", { d, class: yearly ? "series-line faded" : "series-line" }, f.svg);

  if (yearly) {
    const yd = yearly.filter((p) => Number.isFinite(p.y))
      .map((p, i) => `${i ? "L" : "M"}${xScale(p.x).toFixed(1)},${yScale(p.y).toFixed(1)}`).join("");
    el("path", { d: yd, class: "yearly-line" }, f.svg);
    for (const p of yearly) {
      if (Number.isFinite(p.y)) el("circle", { cx: xScale(p.x), cy: yScale(p.y), r: 3.5, class: "yearly-dot" }, f.svg);
    }
  }

  addTooltip(container, f, points, xScale, yScale, (p) =>
    `<strong>${p.label}</strong><br>${p.y.toFixed(decimals)} ${units}`);
}

export function seasonChart(container, { climatology, units, decimals = 2, height = 180 }) {
  const f = frame(container, height);
  const values = climatology.filter(Number.isFinite);
  let yMin = Math.min(0, ...values), yMax = Math.max(0, ...values);
  const pad = (yMax - yMin) * 0.08 || 1;
  if (yMax > 0) yMax += pad;
  if (yMin < 0) yMin -= pad;
  const band = f.innerW / 12;
  const barW = Math.min(24, band * 0.6);
  const xScale = (i) => f.margin.left + band * (i + 0.5);
  const yScale = (y) => f.margin.top + (1 - (y - yMin) / (yMax - yMin)) * f.innerH;
  drawAxes(f, xScale, yScale, [...Array(12).keys()], niceTicks(yMin, yMax, 4), (i) => (f.innerW < 360 ? MONTHS[i][0] : MONTHS[i]));
  climatology.forEach((v, i) => {
    if (!Number.isFinite(v)) return;
    const y0 = yScale(0), y1 = yScale(v);
    const top = Math.min(y0, y1), h = Math.max(1, Math.abs(y1 - y0));
    const r = Math.min(4, h / 2, barW / 2);
    const x = xScale(i) - barW / 2;
    const path = v >= 0
      ? `M${x},${y0}V${top + r}Q${x},${top} ${x + r},${top}H${x + barW - r}Q${x + barW},${top} ${x + barW},${top + r}V${y0}Z`
      : `M${x},${y0}V${top + h - r}Q${x},${top + h} ${x + r},${top + h}H${x + barW - r}Q${x + barW},${top + h} ${x + barW},${top + h - r}V${y0}Z`;
    el("path", { d: path, class: "season-bar" }, f.svg);
  });
  const points = climatology.map((v, i) => ({ x: i, y: v, label: MONTHS[i] }));
  addTooltip(container, f, points, xScale, yScale, (p) =>
    `<strong>${p.label}</strong><br>average ${p.y.toFixed(decimals)} ${units}`);
}
