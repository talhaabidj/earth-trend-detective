// SI-assisted: written with Claude Code (Anthropic) under the team's direction; see docs/AI_USE.md.
// Browser copy of engine/trend/stats.py. Same methods, same numbers (checked by
// engine/tests/test_js_parity.py). Times are [year, month] pairs; missing values are null.

const Z_95 = 1.959963984540054;
export const MIN_YEARS_FOR_TEST = 10;
export const MIN_COVERAGE = 0.7;

const isMissing = (v) => v === null || v === undefined || Number.isNaN(v);

function erf(x) {
  // Abramowitz and Stegun 7.1.26 is too coarse for p-values; use a series/continued fraction.
  const t = Math.abs(x);
  if (t < 3) {
    let sum = t, term = t;
    for (let n = 1; n < 200; n++) {
      term *= -t * t / n;
      const add = term / (2 * n + 1);
      sum += add;
      if (Math.abs(add) < 1e-17) break;
    }
    return Math.sign(x) * (2 / Math.sqrt(Math.PI)) * sum;
  }
  return Math.sign(x) * (1 - erfcLarge(t));
}

function erfcLarge(x) {
  // Continued fraction for erfc, accurate for x >= 3.
  let f = 0;
  for (let k = 60; k >= 1; k--) f = (k / 2) / (x + f);
  return Math.exp(-x * x) / Math.sqrt(Math.PI) / (x + f);
}

export function normalTwoSidedP(z) {
  return 2 * (1 - 0.5 * (1 + erf(Math.abs(z) / Math.SQRT2)));
}

export function mannKendallSAndVar(values) {
  const x = values.filter((v) => !isMissing(v));
  const n = x.length;
  if (n < 2) return { s: 0, varS: 0, n };
  let s = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) s += Math.sign(x[j] - x[i]);
  }
  const counts = new Map();
  for (const v of x) counts.set(v, (counts.get(v) || 0) + 1);
  let tieTerm = 0;
  for (const t of counts.values()) tieTerm += t * (t - 1) * (2 * t + 5);
  return { s, varS: (n * (n - 1) * (2 * n + 5) - tieTerm) / 18, n };
}

export function zFromS(s, varS) {
  if (varS <= 0) return 0;
  if (s > 0) return (s - 1) / Math.sqrt(varS);
  if (s < 0) return (s + 1) / Math.sqrt(varS);
  return 0;
}

function splitByMonth(times, values) {
  const groups = Array.from({ length: 12 }, () => []);
  times.forEach(([year, month], i) => {
    if (!isMissing(values[i])) groups[month - 1].push([year, values[i]]);
  });
  groups.forEach((g) => g.sort((a, b) => a[0] - b[0]));
  return groups;
}

export function seasonalMannKendall(times, values) {
  let s = 0, varS = 0;
  for (const group of splitByMonth(times, values)) {
    const r = mannKendallSAndVar(group.map((p) => p[1]));
    s += r.s;
    varS += r.varS;
  }
  const z = zFromS(s, varS);
  return { s, varS, z, p: normalTwoSidedP(z) };
}

const median = (sorted) => {
  const n = sorted.length;
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
};

// Python's round() rounds halves to even; match it so ranks agree.
function roundHalfEven(x) {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

export function seasonalSenSlope(times, values, varS) {
  const slopes = [];
  for (const group of splitByMonth(times, values)) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (group[j][0] !== group[i][0]) {
          slopes.push((group[j][1] - group[i][1]) / (group[j][0] - group[i][0]));
        }
      }
    }
  }
  if (!slopes.length) return { slope: NaN, low: NaN, high: NaN };
  slopes.sort((a, b) => a - b);
  const count = slopes.length;
  const cAlpha = varS > 0 ? Z_95 * Math.sqrt(varS) : 0;
  const clamp = (r) => Math.min(Math.max(r, 1), count);
  const lowerRank = clamp(roundHalfEven((count - cAlpha) / 2));
  const upperRank = clamp(roundHalfEven((count + cAlpha) / 2) + 1);
  return { slope: median(slopes), low: slopes[lowerRank - 1], high: slopes[upperRank - 1] };
}

export function monthlyClimatology(times, values) {
  return splitByMonth(times, values).map((g) =>
    g.length ? g.reduce((a, p) => a + p[1], 0) / g.length : NaN);
}

export function anomalies(times, values, climatology) {
  return times.map(([, month], i) => (isMissing(values[i]) ? NaN : values[i] - climatology[month - 1]));
}

export function lag1Autocorrelation(residuals) {
  const valid = residuals.filter((v) => !Number.isNaN(v));
  if (valid.length < 4) return 0;
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  let num = 0, den = 0, pairs = 0;
  for (const v of valid) den += (v - mean) ** 2;
  for (let i = 0; i < residuals.length - 1; i++) {
    const a = residuals[i], b = residuals[i + 1];
    if (!Number.isNaN(a) && !Number.isNaN(b)) { num += (a - mean) * (b - mean); pairs++; }
  }
  if (pairs < 3 || den === 0) return 0;
  return num / den;
}

// Student t distribution via the regularised incomplete beta function.
function logGamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const ci of c) ser += ci / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

function betaContinuedFraction(a, b, x) {
  const tiny = 1e-300;
  let c = 1, d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return h;
}

function regularizedBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return front * betaContinuedFraction(a, b, x) / a;
  return 1 - front * betaContinuedFraction(b, a, 1 - x) / b;
}

export function tTwoSidedP(t, df) {
  return regularizedBeta(df / (df + t * t), df / 2, 0.5);
}

export function tQuantile975(df) {
  let low = 0, high = 100;
  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2;
    if (tTwoSidedP(mid, df) > 0.05) low = mid; else high = mid;
  }
  return (low + high) / 2;
}

export function olsWithAutocorrelation(decimalYears, anomalyValues) {
  const t = [], y = [];
  decimalYears.forEach((ti, i) => {
    if (!Number.isNaN(anomalyValues[i])) { t.push(ti); y.push(anomalyValues[i]); }
  });
  const n = y.length;
  const tMean = t.reduce((a, b) => a + b, 0) / n;
  const yMean = y.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sxx += (t[i] - tMean) ** 2; sxy += (t[i] - tMean) * (y[i] - yMean); }
  const slope = sxy / sxx;
  const intercept = yMean - slope * tMean;
  const residualsFull = decimalYears.map((ti, i) =>
    Number.isNaN(anomalyValues[i]) ? NaN : anomalyValues[i] - (intercept + slope * ti));
  const r1 = lag1Autocorrelation(residualsFull);
  const r1Used = Math.min(Math.max(r1, 0), 0.99);
  const nEff = n * (1 - r1Used) / (1 + r1Used);
  let sse = 0;
  for (let i = 0; i < n; i++) sse += (y[i] - (intercept + slope * t[i])) ** 2;
  const residualSd = Math.sqrt(sse / (n - 2));
  let p = NaN, low = NaN, high = NaN;
  if (nEff > 3) {
    const se = residualSd / Math.sqrt(sxx) * Math.sqrt((n - 2) / (nEff - 2));
    p = tTwoSidedP(slope / se, nEff - 2);
    const tCrit = tQuantile975(nEff - 2);
    low = slope - tCrit * se;
    high = slope + tCrit * se;
  }
  return { slope, intercept, low, high, p, r1, n, nEff, residualSd };
}

// Weatherhead et al. (1998): years of monthly data for a 90% chance of detecting the trend at
// the 5% level.
export function yearsToDetect(noiseSd, trendPerYear, phi) {
  if (!trendPerYear || Number.isNaN(trendPerYear)) return Infinity;
  const p = Math.min(Math.max(phi, 0), 0.99);
  return ((3.3 * noiseSd / Math.abs(trendPerYear)) * Math.sqrt((1 + p) / (1 - p))) ** (2 / 3);
}

export function decideVerdict(mkP, olsP, recordYears, coverage, extraYearsNeeded) {
  if (recordYears < MIN_YEARS_FOR_TEST || coverage < MIN_COVERAGE) return "too_short";
  const mkSig = mkP < 0.05;
  const olsSig = !Number.isNaN(olsP) && olsP < 0.05;
  if (mkSig && olsSig) return "clear";
  if (mkSig || olsSig) return "mixed";
  if (extraYearsNeeded <= 50) return "not_yet";
  return "none";
}

export function analyse(times, values) {
  const clean = values.map((v) => (isMissing(v) ? NaN : v));
  const nMonths = clean.length;
  const nValid = clean.filter((v) => !Number.isNaN(v)).length;
  const recordYears = nMonths / 12;
  const coverage = nMonths ? nValid / nMonths : 0;
  const mk = seasonalMannKendall(times, clean);
  const sen = seasonalSenSlope(times, clean, mk.varS);
  const climatology = monthlyClimatology(times, clean);
  const anomalyValues = anomalies(times, clean, climatology);
  const decimalYears = times.map(([y, m]) => y + (m - 0.5) / 12);
  const ols = olsWithAutocorrelation(decimalYears, anomalyValues);
  // Least-squares slope: see the note in engine/trend/stats.py.
  const yearsNeeded = yearsToDetect(ols.residualSd, ols.slope, ols.r1);
  const extra = Math.max(0, yearsNeeded - recordYears);
  const flags = [];
  if (recordYears < MIN_YEARS_FOR_TEST) flags.push("short_record");
  if (coverage < MIN_COVERAGE) flags.push("low_coverage");
  if (ols.r1 > 0.5) flags.push("strong_autocorrelation");
  if (sen.slope === 0 && ols.slope !== 0) flags.push("median_slope_zero");
  return {
    result: {
      n_months: nMonths, n_valid: nValid,
      first_year: times[0][0], last_year: times[times.length - 1][0],
      record_years: recordYears, coverage,
      mk_s: mk.s, mk_z: mk.z, mk_p: mk.p,
      sen_slope_per_year: sen.slope, sen_low_per_year: sen.low, sen_high_per_year: sen.high,
      ols_slope_per_year: ols.slope, ols_low_per_year: ols.low, ols_high_per_year: ols.high,
      ols_p: ols.p, lag1_autocorrelation: ols.r1, effective_n: ols.nEff, noise_sd: ols.residualSd,
      years_needed: yearsNeeded, extra_years_needed: extra,
      verdict: decideVerdict(mk.p, ols.p, recordYears, coverage, extra),
      flags,
    },
    climatology,
    anomalies: anomalyValues,
    olsIntercept: ols.intercept,
  };
}
