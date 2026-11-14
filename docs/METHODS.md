# Methods

This page explains every step from NASA data to the verdict, the checks we ran, and the limits.

## 1. Data

- **NASA POWER monthly** (any point on Earth, 1981–2025). POWER serves NASA's MERRA-2 reanalysis
  (weather and land variables) and CERES satellite products (sunlight, cloud). One point is one
  grid cell of about 0.5° × 0.625° (about 50 km). A "wider area" is a 2° × 2° box; we average
  its grid cells weighted by cos(latitude), because cells near the poles cover less ground.
- **MODIS NDVI** (Terra MOD13Q1 v6.1, 250 m, 16-day composites, 2000–2025), used in the
  precomputed examples. We take the median NDVI of the valid pixels in a 5 km × 5 km window around
  the point, skip a composite if fewer than half the pixels are valid, and average the composites
  that start in each calendar month.
- **Cleaning:** POWER adds a 13th "month" per year that is the annual value; we drop it. POWER uses
  -999 and MODIS uses -3000 for missing values; we turn these into gaps. **Gaps are never filled.**
- **Product joins:** POWER's sunlight and cloud values come from GEWEX SRB before 2001 and CERES
  SYN1deg after. A jump at the join could look like a trend, so for these two variables the tool
  only uses 2001 onward.

## 2. Removing the seasons

For each calendar month we compute the average over the record (the *climatology*) and subtract it
from that month's values. What is left are *anomalies*: how unusual each month was for its time of
year. The tool shows the raw series, the climatology and the anomalies, so a user can see exactly
what was removed.

## 3. Two trend tests

**Test 1, seasonal Mann-Kendall** (Hirsch, Slack & Smith 1982). For each calendar month separately,
compare every pair of years and count ups minus downs (the S statistic). Add the 12 monthly S values
and their variances (with the correction for tied values), and turn that into a z-score and a
two-sided p-value. The rate is the **seasonal Sen slope**: the median of all within-month pairwise
slopes (Sen 1968), with a 95% interval from the ranks of the ordered slopes (Gilbert 1987).
This test does not care about outliers or the shape of the distribution.

**Test 2, least squares on the anomalies with an autocorrelation correction** (Santer et al. 2000).
Fit a straight line to the anomalies. Monthly anomalies carry over from one month to the next
(lag-1 autocorrelation r1), so the data hold less independent information than the month count
suggests. We use an effective sample size n_eff = n (1 − r1) / (1 + r1), inflate the standard error
to match, and test with a t distribution on n_eff − 2 degrees of freedom.

**Verdict rules** (5% level):

| Verdict | Rule |
|---|---|
| Yes (clear trend) | both tests p < 0.05 |
| Maybe | only one test p < 0.05 |
| Not significant yet | neither test, and fewer than 50 more years would be needed at the current rate |
| No detectable trend | neither test, and 50 or more years would be needed |
| Not enough data | under 10 years, or under 70% of months present |

The rate shown is the Sen slope. When many values repeat (rounded or zero-heavy data such as desert
rain), the Sen slope can be exactly 0 even with a real trend; then we show the least-squares slope
and say so.

## 4. How many more years?

When a trend is not significant, we estimate the number of years of monthly data needed for a 90%
chance of detecting it at the 5% level, if it continued at the current rate:

n* = [ (3.3 σN / |ω0|) × sqrt((1 + φ) / (1 − φ)) ]^(2/3)

where ω0 is the trend per year (least-squares slope), σN is the standard deviation of the monthly
anomaly residuals and φ their lag-1 autocorrelation (Weatherhead et al. 1998). "More years needed"
is n* minus the record length. This is an estimate, not a promise: the trend may not continue.

Honesty note: we could not open the full text of Weatherhead et al. (1998) during the event. The
formula above is the form widely quoted from that paper; we have not checked it against the
original page.

## 5. Checks we ran

All in `engine/tests/` (run `cd engine && python -m pytest`), and on every push in GitHub Actions:

- Mann-Kendall S, variance, z and p match the `pymannkendall` library (v1.4.3) exactly, including ties.
- Seasonal Mann-Kendall and the seasonal Sen slope match `pymannkendall`.
- A synthetic series with a known trend of 0.05 per year is recovered within its 95% intervals.
- Pure noise gives no significant trend.
- Short records are refused; gaps stay gaps.
- Years-to-detect grows with noise and autocorrelation.
- POWER's month 13 and -999 values are removed; the area average uses cos(latitude).
- The browser copy (`web/js/stats.js`) gives the same numbers as the Python engine on three test
  series, including gaps (the test runs the JavaScript through Node).
- Every demo example states the verdict it expects; `engine/scripts/build_examples.py` stops if the
  data gives a different one, so the story text cannot disagree with the numbers.

## 6. Limits

- POWER is a model-based product at about 50 km, not a weather station. City-scale effects (such as
  a city's own heat island) are smoothed out.
- A linear trend is a summary. Real changes can speed up, slow down or jump.
- The seasonal Mann-Kendall test assumes the 12 months are independent of each other; strong
  autocorrelation makes it too confident. That is why we also run test 2 and only say "Yes" when
  both agree.
- Finding a trend is not the same as explaining its cause.

## References

- Gilbert, R. O. (1987). *Statistical Methods for Environmental Pollution Monitoring.* Van Nostrand Reinhold.
- Hirsch, R. M., Slack, J. R., & Smith, R. A. (1982). Techniques of trend analysis for monthly water quality data. *Water Resources Research*, 18(1), 107–121.
- Hussain, M., & Mahmud, I. (2019). pyMannKendall: a python package for non parametric Mann Kendall family of trend tests. *Journal of Open Source Software*, 4(39), 1556.
- Santer, B. D., et al. (2000). Statistical significance of trends and trend differences in layer-average atmospheric temperature time series. *Journal of Geophysical Research*, 105(D6), 7337–7356.
- Sen, P. K. (1968). Estimates of the regression coefficient based on Kendall's tau. *Journal of the American Statistical Association*, 63(324), 1379–1389.
- Weatherhead, E. C., et al. (1998). Factors affecting the detection of trends: Statistical considerations and applications to environmental data. *Journal of Geophysical Research*, 103(D14), 17149–17161. doi:10.1029/98JD00995
