# Data, code and other resources

The Space Apps terms ask us to cite every resource, open source or not. This is the full list.

## NASA data

| Data | What we use | Access | Licence / terms |
|---|---|---|---|
| NASA POWER (Prediction Of Worldwide Energy Resources), NASA Langley Research Center, monthly temporal API | 14 variables (temperature, rain, humidity, soil wetness, evaporation, wind, sunlight, cloud, snow, frost days), 1981–2025 | https://power.larc.nasa.gov/api/temporal/monthly/ (no login) | NASA open data, free to use; POWER asks users to acknowledge the source |
| MERRA-2 reanalysis, NASA Global Modeling and Assimilation Office (GMAO) | the source POWER reports for the weather and land variables | through POWER | NASA open data |
| CERES SYN1deg, NASA Langley | the source POWER reports for sunlight and cloud from 2001 | through POWER | NASA open data |
| GEWEX SRB (NASA Langley) | POWER's source for sunlight and cloud before 2001 (we do not use these years) | through POWER | NASA open data |
| MODIS Terra Vegetation Indices MOD13Q1 v6.1 (Didan, K., 2021, NASA EOSDIS LP DAAC, doi:10.5067/MODIS/MOD13Q1.061) | NDVI for the demo examples, 2000–2025 | ORNL DAAC MODIS Web Service, https://modis.ornl.gov/data/modis_webservice.html (no login) | NASA open data; ORNL DAAC asks users to cite the product and the service |

Resources from the challenge page that informed the work: Giovanni (NASA GES DISC), the NASA NTRS
paper on SeaWiFS chlorophyll time-series and significance testing
(https://ntrs.nasa.gov/api/citations/20090042747/downloads/20090042747.pdf), and the KNMI Climate
Explorer (partner resource), which we looked at as an existing tool.

## Code libraries

| Library | Use | Licence |
|---|---|---|
| Leaflet 1.9.4 (vendored in `web/vendor/leaflet/`) | the map | BSD-2-Clause |
| NumPy | engine arithmetic | BSD-3-Clause |
| SciPy | t distribution in the engine | BSD-3-Clause |
| pymannkendall 1.4.3 | used only in tests, to check our Mann-Kendall code | MIT |
| requests | downloading data in the engine scripts | Apache-2.0 |
| pytest | tests | MIT |

The web page has no other dependencies and no build step. Charts are our own SVG code.

## Map tiles

OpenStreetMap standard tiles, © OpenStreetMap contributors, data under the Open Database License
(ODbL). Used within the OSM tile usage policy (light use, attribution shown on the map).

## Hosting and tools

- GitHub (code hosting, Actions for tests), Vercel Hobby plan (static hosting). Free tiers.
- Claude Code (Anthropic), an SI coding assistant: see [AI_USE.md](AI_USE.md).

## Text, images and fonts

- No images, icons or fonts from third parties. Text uses the visitor's system font.
- Screenshots in the README and project page are of this app.
- Scientific references are listed in [METHODS.md](METHODS.md).

## Prior work

See [REUSED.md](REUSED.md). No code from the team's earlier projects is included.
