// Reads {stations, lat, lon, modelVerdict, modelRate} as JSON from stdin and prints the browser's
// second opinion for that place. Used by engine/tests/test_second_opinion.py.
import { nearestStation, secondOpinionText } from "../web/js/second-opinion.js";

let input = "";
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  const { stations, lat, lon, modelVerdict, modelRate } = JSON.parse(input);
  const found = nearestStation(stations, lat, lon);
  const answer = found
    ? { name: found.station.name, km: found.km, ...secondOpinionText(found.station, found.km, modelVerdict, modelRate) }
    : null;
  process.stdout.write(JSON.stringify(answer));
});
