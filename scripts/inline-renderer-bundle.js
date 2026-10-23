/**
 * Gera renderer.html autocontido (sem imports locais ./js/*).
 * Uso: node scripts/inline-renderer-bundle.js
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rendererPath = path.join(root, "renderer.html");
const bundlePath = path.join(root, "js", "renderer-bundle.source.js");

const START = "/* __RENDERER_BUNDLE_START__ */";
const END = "/* __RENDERER_BUNDLE_END__ */";

/**
 * @param {string} source
 * @returns {string}
 */
function stripEsmForInline(source) {
  let text = String(source || "");
  text = text.replace(/^import\s+[\s\S]*?from\s+["'][^"']+["'];?\s*\n?/gmu, "");
  text = text.replace(/^export\s+async\s+/gmu, "async ");
  text = text.replace(/^export\s+(const|function|class)\s+/gmu, "$1 ");
  text = text.replace(/^export\s+\{[^}]+\};?\s*\n?/gmu, "");
  text = text.replace(/^export\s+default\s+/gmu, "");
  return text.trim();
}

const bundleParts = [
  fs.readFileSync(bundlePath, "utf8"),
  stripEsmForInline(
    fs.readFileSync(path.join(root, "js", "json-view-mode.js"), "utf8"),
  ),
  stripEsmForInline(
    fs.readFileSync(path.join(root, "js", "json-viewer.js"), "utf8"),
  ),
];
const bundle = bundleParts.filter(Boolean).join("\n\n");
let html = fs.readFileSync(rendererPath, "utf8");

const startIdx = html.indexOf(START);
const endIdx = html.indexOf(END);
if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
  throw new Error(`Marcadores ${START} / ${END} não encontrados em renderer.html`);
}

html =
  html.slice(0, startIdx + START.length) +
  "\n" +
  bundle +
  "\n      " +
  html.slice(endIdx);

html = html.replace(
  /import \{ createD3ForceRenderer, normalizeD3Config \} from "\.\/js\/renderer-bundle\.js";\n\n/g,
  "",
);
html = html.replace(
  /import \{ renderJsonToRoot, parseJsonDocument \} from "\.\/js\/json-viewer\.js";\n/g,
  "",
);
html = html.replace(
  /import \{ normalizeJsonViewMode \} from "\.\/js\/json-view-mode\.js";\n/g,
  "",
);

fs.writeFileSync(rendererPath, html);
console.log("renderer.html atualizado com bundle inline.");
