// Turns the test results into plain sentences: fixed templates filled with the computed numbers.

export function signed(value, decimals = 2) {
  if (!Number.isFinite(value)) return "–";
  const text = Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(decimals);
  return value > 0 ? `+${text}` : text;
}

function pText(p) {
  if (!Number.isFinite(p)) return "–";
  return p < 0.001 ? "less than 0.001" : p.toFixed(3);
}

// The rate per decade we show. Normally the Sen slope; the straight-line slope when many
// repeated values make the Sen slope exactly zero.
export function decadeRate(result) {
  const useLine = result.warnings.includes("median_slope_zero");
  return {
    rate: 10 * (useLine ? result.line_slope : result.sen_slope),
    low: 10 * (useLine ? result.line_low : result.sen_low),
    high: 10 * (useLine ? result.line_high : result.sen_high),
    method: useLine ? "straight-line slope" : "median (Sen) slope",
  };
}

const WARNING_TEXT = {
  short_record: "Short record: fewer than 10 years.",
  many_missing: "Many months are missing.",
  strong_memory: "Strong month-to-month memory: one unusual month makes the next one likely to be unusual too. The second test allows for this, so trust it more.",
  median_slope_zero: "Many repeated values make the median slope exactly 0, so the straight-line slope is shown instead.",
  mostly_zero: "This value is zero in most months here, so the result rests on a few unusual months. Read it with care.",
};

// The short "case status" shown above each verdict.
const CASE_STATUS = {
  clear: "Case closed",
  mixed: "A lead to check",
  not_yet: "Case still open",
  none: "No case",
  too_short: "Not enough evidence",
  no_data: "No data",
  constant: "Nothing to test",
};

function numbersBehind(result, rateText, rangeText, method, withUnits, decimals) {
  const yearsNeededText = Number.isFinite(result.years_needed) ? Math.round(result.years_needed) : "more than 10,000";
  const yearsLine = result.verdict === "clear"
    ? "Years of data needed: none more, the trend is already significant"
    : `Years of data needed for a 90% chance of detection: ${yearsNeededText} (based on the straight-line ` +
      `slope, ${withUnits(signed(10 * result.line_slope, decimals))} per decade)`;
  return [
    `Seasonal Mann-Kendall test: p = ${pText(result.mk_p)}`,
    `Straight-line test on the anomalies, allowing for month-to-month memory: p = ${pText(result.line_p)} ` +
      `(counts as ${Math.round(result.effective_months)} independent months out of ${result.valid_months})`,
    `Rate from the ${method}: ${rateText} (${rangeText})`,
    `Rate from the straight-line test: ${withUnits(signed(10 * result.line_slope, decimals))} per decade ` +
      `(95% range ${signed(10 * result.line_low, decimals)} to ${signed(10 * result.line_high, decimals)}, widened for month-to-month memory)`,
    `Month-to-month memory (lag-1 autocorrelation): ${result.autocorrelation.toFixed(2)}`,
    yearsLine,
  ];
}

export function describe(result, variable) {
  const special = {
    no_data: {
      tone: "none", direction: "flat",
      title: "No data here for this question",
      body: `NASA's data has no values for ${variable.name.toLowerCase()} at this place. Try another question or a nearby place.`,
    },
    constant: {
      tone: "none", direction: "flat",
      title: "This never changes here",
      body: `Every month has the same value for ${variable.name.toLowerCase()} at this place (this happens over open ocean or ice). ` +
        "There is nothing to test. Try another question.",
    },
    too_short: {
      tone: "none", direction: "flat",
      title: "Not enough data to test",
      body: "A trend test needs at least 10 years, with values for at least 70% of the months.",
    },
  }[result.verdict];
  if (special) {
    return { ...special, status: CASE_STATUS[result.verdict], tiles: [], numbers: [], warnings: [], rate: NaN, low: NaN, high: NaN, hasTrend: false };
  }

  const { rate, low, high, method } = decadeRate(result);
  const decimals = variable.decimals;
  const units = variable.units;
  const withUnits = (number) => (units ? `${number} ${units}` : number);
  const direction = rate > 0 ? "rising" : "falling";
  const rateText = `${withUnits(signed(rate, decimals))} per decade`;
  const rangeText = `95% range ${signed(low, decimals)} to ${signed(high, decimals)}`;
  const moreYears = Math.ceil(result.more_years_needed);
  const yearsShown = Math.round(result.years_of_data);

  const verdicts = {
    clear: {
      tone: "clear", direction,
      title: `Yes: ${direction}, ${rateText}`,
      body: `Both tests agree (${rangeText}). If there were no real trend, a result this strong would turn up ` +
        `by chance less than 1 time in 20. Over the ${yearsShown} years shown, ` +
        `that adds up to about ${withUnits(signed(rate * result.years_of_data / 10, decimals))}.`,
    },
    mixed: {
      tone: "mixed", direction,
      title: `Maybe: ${direction}, ${rateText}`,
      body: (result.warnings.includes("mostly_zero")
        ? `The tests point to a change (${rangeText}), but the value is zero in most months here, so it rests on a few months. `
        : `One test says this is significant and the other does not (${rangeText}). `) +
        "Treat it as a lead to check, not a finding.",
    },
    not_yet: {
      tone: "not-yet", direction,
      title: `Not significant yet: ${rateText}`,
      body: `The change is small next to the natural ups and downs (${rangeText}, which includes zero). ` +
        `If it kept going at this rate, about ${moreYears} more year${moreYears === 1 ? "" : "s"} of data ` +
        "would give a 90% chance of a significant result.",
    },
    none: {
      tone: "none", direction: "flat",
      title: "No detectable trend",
      body: `Any change (${rateText}, ${rangeText}) is tiny next to the natural ups and downs. ` +
        (Number.isFinite(result.more_years_needed)
          ? `At this rate it would take about ${moreYears} more years of data to tell.`
          : "At this rate no realistic amount of extra data would show a trend."),
    },
  };

  // Three key numbers shown large under the verdict.
  const lastTile = {
    clear: { label: `Change over ${yearsShown} years`, value: rate * result.years_of_data / 10, text: null },
    mixed: { label: "Tests that agree", value: null, text: "1 of 2" },
    not_yet: { label: "More data needed", value: null, text: `about ${moreYears} years` },
    none: { label: "Tests that agree", value: null, text: "0 of 2" },
  }[result.verdict];
  const tiles = [
    { label: "Rate per decade", value: rate, text: null },
    { label: "95% range", value: null, text: `${signed(low, decimals)} to ${signed(high, decimals)}` },
    lastTile,
  ];

  return {
    ...verdicts[result.verdict],
    tiles,
    status: CASE_STATUS[result.verdict],
    numbers: numbersBehind(result, rateText, rangeText, method, withUnits, decimals),
    warnings: result.warnings.map((w) => WARNING_TEXT[w]).filter(Boolean),
    rate,
    low,
    high,
    hasTrend: true,
  };
}
