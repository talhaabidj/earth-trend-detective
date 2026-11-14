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
function decadeRate(result) {
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
};

export function describe(result, variable) {
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
      tone: "clear",
      title: `Yes: ${direction}, ${rateText}`,
      body: `Both tests agree (${rangeText}). If there were no real trend, a result this strong would turn up ` +
        `by chance less than 1 time in 20. Over the ${yearsShown} years shown, ` +
        `that adds up to about ${withUnits(signed(rate * result.years_of_data / 10, decimals))}.`,
    },
    mixed: {
      tone: "mixed",
      title: `Maybe: ${direction}, ${rateText}`,
      body: `One test says this is significant and the other does not (${rangeText}). Treat it as a lead ` +
        "to check, not a finding.",
    },
    not_yet: {
      tone: "not-yet",
      title: `Not significant yet: ${rateText}`,
      body: `The change is small next to the natural ups and downs (${rangeText}, which includes zero). ` +
        `If it kept going at this rate, about ${moreYears} more year${moreYears === 1 ? "" : "s"} of data ` +
        "would give a 90% chance of a significant result.",
    },
    none: {
      tone: "none",
      title: "No detectable trend",
      body: `Any change (${rateText}, ${rangeText}) is tiny next to the natural ups and downs. ` +
        (Number.isFinite(result.more_years_needed)
          ? `At this rate it would take about ${moreYears} more years of data to tell.`
          : "At this rate no realistic amount of extra data would show a trend."),
    },
    too_short: {
      tone: "none",
      title: "Not enough data to test",
      body: "A trend test needs at least 10 years, with values for at least 70% of the months.",
    },
  };

  const yearsNeededText = Number.isFinite(result.years_needed) ? Math.round(result.years_needed) : "more than 1,000";
  const yearsLine = result.verdict === "clear"
    ? "Years of data needed: none more, the trend is already significant"
    : `Years of data needed for a 90% chance of detection: ${yearsNeededText} (based on the straight-line ` +
      `slope, ${withUnits(signed(10 * result.line_slope, decimals))} per decade)`;
  const numbers = [
    `Seasonal Mann-Kendall test: p = ${pText(result.mk_p)}`,
    `Straight-line test on the anomalies, allowing for month-to-month memory: p = ${pText(result.line_p)} ` +
      `(counts as ${Math.round(result.effective_months)} independent months out of ${result.valid_months})`,
    `Rate from the ${method}: ${rateText} (${rangeText})`,
    `Month-to-month memory (lag-1 autocorrelation): ${result.autocorrelation.toFixed(2)}`,
    yearsLine,
  ];

  return {
    ...verdicts[result.verdict],
    numbers,
    warnings: result.warnings.map((w) => WARNING_TEXT[w]).filter(Boolean),
    rate,
    low,
    high,
  };
}
