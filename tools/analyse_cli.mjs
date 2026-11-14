// Reads [{year, month, value}, ...] from stdin and prints the browser engine's result.
// Used by engine/tests/test_js_parity.py.
import { analyse } from "../web/js/stats.js";

let input = "";
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  process.stdout.write(JSON.stringify(analyse(JSON.parse(input)).result));
});
