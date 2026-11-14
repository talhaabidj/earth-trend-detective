// Reads a JSON list of p-values from stdin and prints which pass the browser's false discovery check.
// Used by engine/tests/test_js_parity.py.
import { passesFalseDiscoveryCheck } from "../web/js/trend-map.js";

let input = "";
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  process.stdout.write(JSON.stringify(passesFalseDiscoveryCheck(JSON.parse(input))));
});
