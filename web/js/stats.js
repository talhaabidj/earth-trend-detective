// Trend tests for monthly data, the same as engine/trend/stats.py (the tests check they agree).
// A series is a list of {year, month, value} rows. A missing value is null.

const Z_FOR_95_PERCENT = 1.959963984540054;
const MIN_YEARS = 10;
const MIN_SHARE_VALID = 0.7;
const MAX_MORE_YEARS_FOR_NOT_YET = 50;

const isMissing = (value) => value === null || value === undefined || Number.isNaN(value);

// --- Normal and t distributions (JavaScript has no built-in versions) ----------------------

function erf(x) {
  const size = Math.abs(x);
  if (size < 3) {
    // Taylor series: accurate to about 1e-15 for small x.
    let sum = size;
    let term = size;
    for (let n = 1; n < 200; n++) {
      term *= -size * size / n;
      const next = term / (2 * n + 1);
      sum += next;
      if (Math.abs(next) < 1e-17) break;
    }
    return Math.sign(x) * (2 / Math.sqrt(Math.PI)) * sum;
  }
  // Continued fraction for large x.
  let fraction = 0;
  for (let k = 60; k >= 1; k--) fraction = (k / 2) / (size + fraction);
  const tail = Math.exp(-size * size) / Math.sqrt(Math.PI) / (size + fraction);
  return Math.sign(x) * (1 - tail);
}

function twoSidedPFromZ(z) {
  return 2 * (1 - 0.5 * (1 + erf(Math.abs(z) / Math.SQRT2)));
}

function logGamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let series = 1.000000000190015;
  for (const ci of c) series += ci / ++y;
  return -tmp + Math.log(2.5066282746310005 * series / x);
}

// Regularised incomplete beta function (Numerical Recipes, continued fraction).
function incompleteBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return front * betaFraction(a, b, x) / a;
  return 1 - front * betaFraction(b, a, 1 - x) / b;
}

function betaFraction(a, b, x) {
  const tiny = 1e-300;
  const safe = (v) => (Math.abs(v) < tiny ? tiny : v);
  let c = 1;
  let d = 1 / safe(1 - (a + b) * x / (a + 1));
  let result = d;
  for (let m = 1; m <= 300; m++) {
    const even = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 / safe(1 + even * d);
    c = safe(1 + even / c);
    result *= d * c;
    const odd = -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 / safe(1 + odd * d);
    c = safe(1 + odd / c);
    result *= d * c;
    if (Math.abs(d * c - 1) < 1e-15) break;
  }
  return result;
}

function tTwoSidedP(t, degrees) {
  return incompleteBeta(degrees / (degrees + t * t), degrees / 2, 0.5);
}

function t95(degrees) {
  // Find t where the two-sided p is 0.05, by halving the search range.
  let low = 0;
  let high = 100;
  for (let i = 0; i < 200; i++) {
    const middle = (low + high) / 2;
    if (tTwoSidedP(middle, degrees) > 0.05) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

// --- Test 1: seasonal Mann-Kendall ---------------------------------------------------------

function mannKendallScore(values) {
  const valid = values.filter((v) => !isMissing(v));
  const count = valid.length;
  let score = 0;
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) score += Math.sign(valid[j] - valid[i]);
  }
  const tieSizes = new Map();
  for (const v of valid) tieSizes.set(v, (tieSizes.get(v) || 0) + 1);
  let tiePart = 0;
  for (const t of tieSizes.values()) tiePart += t * (t - 1) * (2 * t + 5);
  const variance = (count * (count - 1) * (2 * count + 5) - tiePart) / 18;
  return { score, variance };
}

function zScore(score, variance) {
  if (variance <= 0 || score === 0) return 0;
  return score > 0 ? (score - 1) / Math.sqrt(variance) : (score + 1) / Math.sqrt(variance);
}

// 12 lists of {year, value}, one per calendar month, missing values left out.
function rowsByMonth(rows) {
  const months = Array.from({ length: 12 }, () => []);
  for (const row of rows) {
    if (!isMissing(row.value)) months[row.month - 1].push({ year: row.year, value: row.value });
  }
  for (const list of months) list.sort((a, b) => a.year - b.year);
  return months;
}

function seasonalMannKendall(rows) {
  let score = 0;
  let variance = 0;
  for (const list of rowsByMonth(rows)) {
    const month = mannKendallScore(list.map((r) => r.value));
    score += month.score;
    variance += month.variance;
  }
  const z = zScore(score, variance);
  return { score, variance, z, p: twoSidedPFromZ(z) };
}

// Python's round() rounds halves to the even number; do the same so the ranks agree.
function roundLikePython(x) {
  const rounded = Math.round(x);
  return Math.abs(x % 1) === 0.5 && rounded % 2 !== 0 ? rounded - 1 : rounded;
}

function median(sorted) {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function seasonalSenSlope(rows, mkVariance) {
  const slopes = [];
  for (const list of rowsByMonth(rows)) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        slopes.push((list[j].value - list[i].value) / (list[j].year - list[i].year));
      }
    }
  }
  if (!slopes.length) return { slope: NaN, low: NaN, high: NaN };
  slopes.sort((a, b) => a - b);
  const count = slopes.length;
  // Gilbert (1987): the 95% range is read from the sorted slopes at these ranks.
  const spread = mkVariance > 0 ? Z_FOR_95_PERCENT * Math.sqrt(mkVariance) : 0;
  const keepInRange = (rank) => Math.min(Math.max(rank, 1), count);
  const lowRank = keepInRange(roundLikePython((count - spread) / 2));
  const highRank = keepInRange(roundLikePython((count + spread) / 2) + 1);
  return { slope: median(slopes), low: slopes[lowRank - 1], high: slopes[highRank - 1] };
}

// --- Seasons and anomalies ------------------------------------------------------------------

// Average value for each calendar month. Index 0 is January.
function usualMonthValues(rows) {
  return rowsByMonth(rows).map((list) =>
    (list.length ? list.reduce((sum, r) => sum + r.value, 0) / list.length : NaN));
}

function anomalies(rows, usual) {
  return rows.map((row) => (isMissing(row.value) ? NaN : row.value - usual[row.month - 1]));
}

// --- Test 2: straight line with an autocorrelation correction --------------------------------

function lag1Autocorrelation(values) {
  const valid = values.filter((v) => !Number.isNaN(v));
  const pairs = [];
  for (let i = 0; i < values.length - 1; i++) {
    if (!Number.isNaN(values[i]) && !Number.isNaN(values[i + 1])) pairs.push([values[i], values[i + 1]]);
  }
  if (pairs.length < 3) return 0;
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  const spread = valid.reduce((sum, v) => sum + (v - mean) ** 2, 0);
  if (spread === 0) return 0;
  return pairs.reduce((sum, [a, b]) => sum + (a - mean) * (b - mean), 0) / spread;
}

function lineTest(times, anomalyValues) {
  const points = [];
  times.forEach((t, i) => { if (!Number.isNaN(anomalyValues[i])) points.push([t, anomalyValues[i]]); });
  const count = points.length;
  const meanT = points.reduce((sum, [t]) => sum + t, 0) / count;
  const meanV = points.reduce((sum, [, v]) => sum + v, 0) / count;
  const spreadT = points.reduce((sum, [t]) => sum + (t - meanT) ** 2, 0);
  const slope = points.reduce((sum, [t, v]) => sum + (t - meanT) * (v - meanV), 0) / spreadT;
  const intercept = meanV - slope * meanT;

  const leftovers = times.map((t, i) => (Number.isNaN(anomalyValues[i]) ? NaN : anomalyValues[i] - (intercept + slope * t)));
  const r = lag1Autocorrelation(leftovers);
  const rUsed = Math.min(Math.max(r, 0), 0.99);
  const effectiveMonths = count * (1 - rUsed) / (1 + rUsed);
  const squares = points.reduce((sum, [t, v]) => sum + (v - (intercept + slope * t)) ** 2, 0);
  const noiseSd = Math.sqrt(squares / (count - 2));

  let p = NaN;
  let low = NaN;
  let high = NaN;
  if (effectiveMonths > 3) {
    const degrees = effectiveMonths - 2;
    const standardError = noiseSd / Math.sqrt(spreadT) * Math.sqrt((count - 2) / degrees);
    p = tTwoSidedP(slope / standardError, degrees);
    const t = t95(degrees);
    low = slope - t * standardError;
    high = slope + t * standardError;
  }
  return { slope, intercept, low, high, p, autocorrelation: r, effectiveMonths, noiseSd };
}

// --- How many more years? -------------------------------------------------------------------

// Weatherhead et al. (1998): years of monthly data for a 90% chance of a significant result.
function yearsNeeded(noiseSd, slopePerYear, autocorrelation) {
  if (!slopePerYear || Number.isNaN(slopePerYear)) return Infinity;
  const r = Math.min(Math.max(autocorrelation, 0), 0.99);
  return ((3.3 * noiseSd / Math.abs(slopePerYear)) * Math.sqrt((1 + r) / (1 - r))) ** (2 / 3);
}

function pickVerdict(mkP, lineP, yearsOfData, shareValid, moreYears) {
  if (yearsOfData < MIN_YEARS || shareValid < MIN_SHARE_VALID) return "too_short";
  const mkSaysYes = mkP < 0.05;
  const lineSaysYes = !Number.isNaN(lineP) && lineP < 0.05;
  if (mkSaysYes && lineSaysYes) return "clear";
  if (mkSaysYes || lineSaysYes) return "mixed";
  if (moreYears <= MAX_MORE_YEARS_FOR_NOT_YET) return "not_yet";
  return "none";
}

// --- Putting it together --------------------------------------------------------------------

export function analyse(rows) {
  rows = rows.map((r) => ({ ...r, value: isMissing(r.value) ? NaN : r.value }));
  const months = rows.length;
  const validMonths = rows.filter((r) => !Number.isNaN(r.value)).length;
  const yearsOfData = months / 12;
  const shareValid = months ? validMonths / months : 0;

  const mk = seasonalMannKendall(rows);
  const sen = seasonalSenSlope(rows, mk.variance);
  const usual = usualMonthValues(rows);
  const anomalyValues = anomalies(rows, usual);
  const times = rows.map((r) => r.year + (r.month - 0.5) / 12);
  const line = lineTest(times, anomalyValues);

  // Straight-line slope here: see the note in engine/trend/stats.py.
  const needed = yearsNeeded(line.noiseSd, line.slope, line.autocorrelation);
  const moreYears = Math.max(0, needed - yearsOfData);

  const warnings = [];
  if (yearsOfData < MIN_YEARS) warnings.push("short_record");
  if (shareValid < MIN_SHARE_VALID) warnings.push("many_missing");
  if (line.autocorrelation > 0.5) warnings.push("strong_memory");
  if (sen.slope === 0 && line.slope !== 0) warnings.push("median_slope_zero");

  const result = {
    months,
    valid_months: validMonths,
    first_year: rows[0].year,
    last_year: rows[months - 1].year,
    years_of_data: yearsOfData,
    share_valid: shareValid,
    mk_score: mk.score,
    mk_z: mk.z,
    mk_p: mk.p,
    sen_slope: sen.slope,
    sen_low: sen.low,
    sen_high: sen.high,
    line_slope: line.slope,
    line_low: line.low,
    line_high: line.high,
    line_p: line.p,
    autocorrelation: line.autocorrelation,
    effective_months: line.effectiveMonths,
    noise_sd: line.noiseSd,
    years_needed: needed,
    more_years_needed: moreYears,
    verdict: pickVerdict(mk.p, line.p, yearsOfData, shareValid, moreYears),
    warnings,
  };
  return { result, usual, anomalies: anomalyValues };
}
