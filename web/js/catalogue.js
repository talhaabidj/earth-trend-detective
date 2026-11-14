// The variables the tool offers, with plain definitions.
// "source" is where the data comes from. "startYear" is the first year we use.

export const THEMES = [
  { id: "heat", label: "Heat", question: "Is it getting hotter?" },
  { id: "water", label: "Rain and water", question: "Is it getting wetter or drier?" },
  { id: "air", label: "Air and sky", question: "Is the air or sky changing?" },
  { id: "cold", label: "Snow and cold", question: "Is winter changing?" },
];

const MERRA2 = "NASA POWER, from MERRA-2 (a NASA model that blends satellite and ground measurements)";
const CERES = "NASA POWER, from CERES SYN1deg (NASA satellite instruments), 2001 onward";

export const VARIABLES = [
  {
    id: "T2M", theme: "heat", name: "Average air temperature", units: "°C", decimals: 2,
    plain: "The average temperature of the air 2 metres above the ground, over day and night.",
    why: "The first thing to check for warming. Compare it with day and night temperatures below.",
    source: MERRA2, startYear: 1981,
  },
  {
    id: "T2M_MAX", theme: "heat", name: "Daytime high temperature", units: "°C", decimals: 2,
    plain: "The hottest air temperature of each day, averaged over the month.",
    why: "Heat waves and crop stress depend on daytime highs.",
    source: MERRA2, startYear: 1981,
  },
  {
    id: "T2M_MIN", theme: "heat", name: "Night-time low temperature", units: "°C", decimals: 2,
    plain: "The coolest air temperature of each day (usually just before dawn), averaged over the month.",
    why: "Warm nights stop bodies, animals and crops from cooling down. Nights often warm faster than days.",
    source: MERRA2, startYear: 1981,
  },
  {
    id: "TS", theme: "heat", name: "Ground surface temperature", units: "°C", decimals: 2,
    plain: "The temperature of the land or sea surface itself (the 'skin'), not the air.",
    why: "Bare ground and cities heat up more than the air above them.",
    source: MERRA2, startYear: 1981,
  },
  {
    id: "PRECTOTCORR", theme: "water", name: "Rainfall (and snowfall)", units: "mm/day", decimals: 3,
    plain: "How much rain or melted snow falls, as an average per day in that month.",
    why: "Changes in rain affect floods, droughts and farming.",
    source: MERRA2 + " (bias-corrected precipitation, PRECTOTCORR)", startYear: 1981,
  },
  {
    id: "GWETTOP", theme: "water", name: "Surface soil wetness", units: "", decimals: 3,
    plain: "How wet the top 5 cm of soil is: 0 is completely dry, 1 is completely soaked.",
    why: "Reacts quickly to rain and heat. A drying surface can mean drought risk.",
    source: MERRA2, startYear: 1981,
  },
  {
    id: "GWETROOT", theme: "water", name: "Root-zone soil wetness", units: "", decimals: 3,
    plain: "How wet the soil is down to about 1 metre, where plant roots drink.",
    why: "Plants and crops depend on it. It changes more slowly than surface wetness.",
    source: MERRA2, startYear: 1981,
  },
  {
    id: "EVLAND", theme: "water", name: "Evaporation from land", units: "mm/day", decimals: 3,
    plain: "How much water leaves the land into the air, from soil and plants, per day.",
    why: "More evaporation can dry soils, or show more water is available (for example from irrigation).",
    source: MERRA2, startYear: 1981,
  },
  {
    id: "RH2M", theme: "air", name: "Relative humidity", units: "%", decimals: 2,
    plain: "How close the air is to being full of water vapour (100% means saturated).",
    why: "Humid heat is harder on the body than dry heat.",
    source: MERRA2, startYear: 1981,
  },
  {
    id: "WS2M", theme: "air", name: "Wind speed near the ground", units: "m/s", decimals: 3,
    plain: "The average wind speed 2 metres above the ground.",
    why: "Wind affects dust, pollution build-up and wind power.",
    source: MERRA2, startYear: 1981,
  },
  {
    id: "ALLSKY_SFC_SW_DWN", theme: "air", name: "Sunlight reaching the ground", units: "MJ/m²/day", decimals: 3,
    plain: "The energy from the sun that reaches the ground each day, after clouds, dust and haze.",
    why: "Less sunlight can mean more haze, smog or cloud. Matters for solar power and crops.",
    source: CERES, startYear: 2001,
    caution: "POWER joins an older product (GEWEX SRB) before 2001. We start in 2001 so the join cannot look like a trend.",
  },
  {
    id: "CLOUD_AMT", theme: "air", name: "Cloud cover", units: "%", decimals: 2,
    plain: "The share of the sky covered by cloud, seen from satellites.",
    why: "Clouds control sunlight, temperature and rain.",
    source: CERES, startYear: 2001,
    caution: "POWER joins an older product (GEWEX SRB) before 2001. We start in 2001 so the join cannot look like a trend.",
  },
  {
    id: "SNODP", theme: "cold", name: "Snow depth", units: "cm", decimals: 2,
    plain: "How deep the snow on the ground is, averaged over the month.",
    why: "Mountain snow feeds rivers in spring and summer.",
    source: MERRA2, startYear: 1981,
    caution: "Model snow is uncertain in high mountains such as the Himalaya and Tibet.",
  },
  {
    id: "FROST_DAYS", theme: "cold", name: "Frost days", units: "days", decimals: 1,
    plain: "The number of days in the month when the air near the ground drops below 0 °C.",
    why: "Fewer frost days is a sign of milder winters; it matters for crops and pests.",
    source: MERRA2, startYear: 1981,
  },
  {
    id: "NDVI", theme: "green", examplesOnly: true, name: "Vegetation greenness (NDVI)", units: "", decimals: 3,
    plain: "How green and leafy the land looks from space: near 0 is bare ground, near 0.8 is thick, healthy plants.",
    why: "Shows crops, forests and deserts changing.",
    source: "MODIS on NASA's Terra satellite (MOD13Q1 v6.1, 250 m), from the ORNL DAAC MODIS Web Service",
    startYear: 2000,
    // Too slow to download live (20-40 seconds per request), so it is only in the examples.
  },
];

// Where to start for a kind of place. Simple fixed rules, no SI.
export const PLACE_TYPES = [
  { id: "city", label: "A big city", suggest: ["T2M_MIN", "RH2M", "ALLSKY_SFC_SW_DWN"],
    reason: "Cities trap heat at night, and haze can cut sunlight." },
  { id: "desert", label: "A desert or dry area", suggest: ["T2M_MAX", "GWETTOP", "PRECTOTCORR"],
    reason: "In dry places, small changes in rain and soil wetness matter most." },
  { id: "mountain", label: "Mountains", suggest: ["T2M", "SNODP", "FROST_DAYS"],
    reason: "Mountains often warm faster, and snow controls the rivers below." },
  { id: "farmland", label: "Farmland", suggest: ["GWETROOT", "EVLAND", "T2M_MAX"],
    reason: "Crops depend on root-zone water and suffer in daytime heat." },
  { id: "rainforest", label: "A rainforest", suggest: ["PRECTOTCORR", "GWETROOT", "T2M_MAX"],
    reason: "Rainforests need steady rain; drying and heat stress them." },
  { id: "coast", label: "A coast", suggest: ["RH2M", "T2M_MIN", "WS2M"],
    reason: "Coastal air is humid; winds and night temperatures shape comfort." },
];

export function findVariable(id) {
  return VARIABLES.find((v) => v.id === id);
}
