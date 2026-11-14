// SI-assisted: written with Claude Code (Anthropic) under the team's direction; see docs/AI_USE.md.
// Turns computed statistics into plain sentences. Fixed templates only: no SI writes these at run time.

export function formatNumber(value, decimals = 2) {
  if (!Number.isFinite(value)) return "–";
  const fixed = Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(decimals);
  return value > 0 ? `+${fixed}` : fixed;
}

function ratePerDecade(result) {
  // Use the median (Sen) slope unless repeated values force it to zero.
  const useOls = result.flags.includes("median_slope_zero");
  return {
    rate: (useOls ? result.ols_slope_per_year : result.sen_slope_per_year) * 10,
    low: (useOls ? result.ols_low_per_year : result.sen_low_per_year) * 10,
    high: (useOls ? result.ols_high_per_year : result.sen_high_per_year) * 10,
    method: useOls ? "least-squares slope" : "median (Sen) slope",
  };
}

function pValueText(p) {
  if (!Number.isFinite(p)) return "–";
  if (p < 0.001) return "less than 0.001";
  return p.toFixed(3);
}

export function describe(result, variable) {
  const { rate, low, high, method } = ratePerDecade(result);
  const d = variable.decimals;
  const unit = variable.units;
  const direction = rate > 0 ? "rising" : "falling";
  const rateText = `${formatNumber(rate, d)} ${unit} per decade`;
  const rangeText = `95% range ${formatNumber(low, d)} to ${formatNumber(high, d)}`;
  const years = Math.ceil(result.extra_years_needed);

  const verdicts = {
    clear: {
      tone: "clear",
      title: `Yes: ${direction}, ${rateText}`,
      body: `Both tests agree this is very unlikely to be chance (${rangeText}). ` +
        `Over the ${Math.round(result.record_years)} years shown, that adds up to about ` +
        `${formatNumber(rate * result.record_years / 10, d)} ${unit}.`,
    },
    mixed: {
      tone: "mixed",
      title: `Maybe: ${direction}, ${rateText}`,
      body: `One test says this is significant and the other does not (${rangeText}). ` +
        "Treat it as a lead to check, not a finding. Month-to-month memory in the data " +
        "can make one test too confident.",
    },
    not_yet: {
      tone: "not-yet",
      title: `Not significant yet: ${rateText}`,
      body: `The change is small compared with the natural ups and downs (${rangeText}, which includes zero). ` +
        `If it kept going at this rate, about ${years} more year${years === 1 ? "" : "s"} of data ` +
        "would give a 90% chance of a significant result.",
    },
    none: {
      tone: "none",
      title: "No detectable trend",
      body: `Any change (${rateText}, ${rangeText}) is tiny compared with the natural ups and downs. ` +
        (Number.isFinite(result.extra_years_needed)
          ? `At this rate it would take about ${years} more years of data to tell.`
          : "At this rate no realistic amount of extra data would show a trend."),
    },
    too_short: {
      tone: "none",
      title: "Not enough data to test",
      body: "A trend test needs at least 10 years with values for at least 70% of the months.",
    },
  };

  const details = [
    `Seasonal Mann-Kendall test: p = ${pValueText(result.mk_p)}`,
    `Least-squares test on anomalies, allowing for autocorrelation: p = ${pValueText(result.ols_p)} ` +
      `(effective sample ${Math.round(result.effective_n)} of ${result.n_valid} months)`,
    `Rate from the ${method}: ${rateText} (${rangeText})`,
    `Lag-1 autocorrelation of the anomalies: ${result.lag1_autocorrelation.toFixed(2)}`,
    `Years of data for a 90% chance of detection at this rate: ` +
      `${Number.isFinite(result.years_needed) ? Math.round(result.years_needed) : "more than 1,000"}`,
  ];

  const flagText = {
    short_record: "Short record: fewer than 10 years.",
    low_coverage: "Many months are missing.",
    strong_autocorrelation: "Strong month-to-month memory: one bad year affects the next. The second test allows for this; trust it more.",
    median_slope_zero: "Many repeated values (rounded or zero-heavy data) make the median slope exactly 0, so the least-squares slope is shown instead.",
  };

  return {
    ...verdicts[result.verdict],
    details,
    warnings: result.flags.map((f) => flagText[f]).filter(Boolean),
    rate, low, high,
  };
}
