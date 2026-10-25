// Renders the opening view into dist/index.html so the page reads with JavaScript off.
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const dataFile = new URL("../prerender-data.json", import.meta.url);
let initial;
try {
  initial = JSON.parse(readFileSync(dataFile, "utf8"));
} catch {
  console.error("Missing web/prerender-data.json. Run from the repo root: uv run python -m scripts.export_web_data");
  process.exit(1);
}

const { render } = await import(pathToFileURL("dist-ssr/entry-server.js").href);
const page = new URL("../dist/index.html", import.meta.url);
// "<" is escaped so the JSON can never close the script tag early.
const data = JSON.stringify(initial).replaceAll("<", "\\u003c");
const html = readFileSync(page, "utf8")
  .replace('data-view=""', () => `data-view="${initial.decision.day} ${initial.decision.gate}"`)
  .replace("<!--app-->", () => render(initial))
  .replace("<!--initial-->", () => `<script>window.__INITIAL__=${data}</script>`);
writeFileSync(page, html);
rmSync("dist-ssr", { recursive: true, force: true });
console.log("prerendered dist/index.html");
