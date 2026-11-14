// SI-assisted: written with Claude Code (Anthropic) under the team's direction; see docs/AI_USE.md.
// Reads {"times": [[y, m], ...], "values": [...]} on stdin and prints the browser engine's result.
import { analyse } from "../web/js/stats.js";

let input = "";
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  const { times, values } = JSON.parse(input);
  process.stdout.write(JSON.stringify(analyse(times, values).result));
});
