/**
 * Dialetos de diagrama suportados (Mermaid, PlantUML, LaTeX).
 */

/** Query param do dialeto (`lang=mermaid` | `lang=puml` | `lang=latex`). */
export const LANG_PARAM = "lang";

export const DIAGRAM_LANG_MERMAID = "mermaid";
export const DIAGRAM_LANG_PLANTUML = "puml";
export const DIAGRAM_LANG_LATEX = "latex";

export const DEFAULT_DIAGRAM_LANG = DIAGRAM_LANG_MERMAID;

const PLANTUML_ALIASES = new Set(["puml", "plantuml"]);
const LATEX_ALIASES = new Set(["latex", "tex"]);

/** Linha que inicia com `@startuml`, `@startgantt`, etc. */
const PLANTUML_LINE_START_RE =
  /^\s*@start(?:uml|gantt|mindmap|salt|wire|json|yaml|dot|ebnf|regex|chronology)/iu;

const LATEX_ENV_RE =
  /\\begin\{(?:equation|align|gather|multline|split|displaymath|array|matrix|pmatrix|bmatrix|vmatrix|cases)\*?\}/iu;

const LATEX_ALIGN_BEGIN = "\\begin{align}";
const LATEX_ALIGN_END = "\\end{align}";

/**
 * @param {unknown} value
 * @returns {"mermaid" | "puml" | "latex"}
 */
export function normalizeDiagramLang(value) {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (PLANTUML_ALIASES.has(raw)) return DIAGRAM_LANG_PLANTUML;
  if (LATEX_ALIASES.has(raw)) return DIAGRAM_LANG_LATEX;
  return DIAGRAM_LANG_MERMAID;
}

/**
 * @param {unknown} lang
 * @returns {boolean}
 */
export function isPlantUmlLang(lang) {
  return normalizeDiagramLang(lang) === DIAGRAM_LANG_PLANTUML;
}

/**
 * @param {unknown} lang
 * @returns {boolean}
 */
export function isLatexLang(lang) {
  return normalizeDiagramLang(lang) === DIAGRAM_LANG_LATEX;
}

/**
 * @param {unknown} lang
 * @returns {boolean}
 */
export function isMermaidLang(lang) {
  return normalizeDiagramLang(lang) === DIAGRAM_LANG_MERMAID;
}

/**
 * @param {unknown} code
 * @returns {boolean}
 */
export function looksLikePlantUmlCode(code) {
  const normalized = String(code ?? "").replace(/^\uFEFF/u, "");
  const trimmed = normalized.trim();
  if (!trimmed) return false;
  const lineStartRe = PLANTUML_LINE_START_RE;
  for (const line of trimmed.split(/\r?\n/u)) {
    if (lineStartRe.test(line)) return true;
  }
  return false;
}

/**
 * @param {unknown} code
 * @returns {boolean}
 */
export function looksLikeLatexCode(code) {
  const normalized = String(code ?? "").replace(/^\uFEFF/u, "");
  const trimmed = normalized.trim();
  if (!trimmed) return false;
  if (/^\\documentclass\b/u.test(trimmed)) return true;
  if (LATEX_ENV_RE.test(trimmed)) return true;
  if (trimmed.includes("$$")) return true;
  if (trimmed.includes("\\[")) return true;
  if (/^\\\[/u.test(trimmed)) return true;
  if (/^\\[a-zA-Z@]/u.test(trimmed) && !trimmed.startsWith("@")) return true;
  return false;
}

/**
 * Prioriza marcadores no código; senão usa o dialeto explícito.
 * @param {unknown} code
 * @param {unknown} explicitLang
 * @returns {"mermaid" | "puml" | "latex"}
 */
export function resolveDiagramLang(code, explicitLang) {
  const explicit = normalizeDiagramLang(explicitLang);

  if (isLatexLang(explicit)) {
    if (looksLikePlantUmlCode(code)) return DIAGRAM_LANG_PLANTUML;
    return DIAGRAM_LANG_LATEX;
  }

  if (isPlantUmlLang(explicit)) {
    if (looksLikeLatexCode(code) && !looksLikePlantUmlCode(code)) {
      return DIAGRAM_LANG_LATEX;
    }
    return DIAGRAM_LANG_PLANTUML;
  }

  if (looksLikePlantUmlCode(code)) return DIAGRAM_LANG_PLANTUML;
  if (looksLikeLatexCode(code)) return DIAGRAM_LANG_LATEX;
  return DIAGRAM_LANG_MERMAID;
}

/**
 * @param {URLSearchParams} [params]
 * @returns {"mermaid" | "puml" | "latex"}
 */
export function parseLangParam(params = new URLSearchParams()) {
  const raw = params.get(LANG_PARAM);
  if (raw == null || raw === "") return DEFAULT_DIAGRAM_LANG;
  return normalizeDiagramLang(raw);
}

/**
 * @param {unknown} lang
 * @returns {string}
 */
export function sourceFileExtension(lang) {
  if (isPlantUmlLang(lang)) return "puml";
  if (isLatexLang(lang)) return "tex";
  return "mmd";
}

/**
 * @param {unknown} lang
 * @returns {string}
 */
export function diagramTypeLabel(lang) {
  if (isPlantUmlLang(lang)) return "PlantUML";
  if (isLatexLang(lang)) return "LaTeX";
  return "Mermaid";
}

/**
 * @param {unknown} lang
 * @returns {string}
 */
export function sourceDownloadLabel(lang) {
  if (isPlantUmlLang(lang)) return "Baixar .puml";
  if (isLatexLang(lang)) return "Baixar .tex";
  return "Baixar .mmd";
}

/**
 * @param {unknown} lang
 * @param {boolean} expanded
 * @returns {string}
 */
export function sourceToggleLabel(_lang, expanded) {
  return expanded ? "Ocultar código" : "Ver código";
}

/**
 * @param {unknown} code
 * @returns {string}
 */
function normalizeLatexSource(code) {
  return String(code ?? "").replace(/^\uFEFF/u, "");
}

/**
 * Conteúdo LaTeX que ainda precisa de `\begin{align}…\end{align}`.
 * @param {unknown} code
 * @returns {boolean}
 */
export function needsLatexAlignWrap(code) {
  const trimmed = normalizeLatexSource(code).trim();
  if (!trimmed) return true;
  if (/^\\documentclass\b/u.test(trimmed)) return false;
  if (LATEX_ENV_RE.test(trimmed)) return false;
  if (/^\$\$[\s\S]*\$\$$/u.test(trimmed)) return false;
  if (/^\\\[[\s\S]*\\\]$/u.test(trimmed)) return false;
  return true;
}

/**
 * Envolve o código em `align` quando ainda não há ambiente ou delimitadores.
 * @param {unknown} code
 * @returns {string}
 */
export function wrapLatexAlignEnvironment(code) {
  const normalized = normalizeLatexSource(code);
  if (!needsLatexAlignWrap(normalized)) return normalized;
  const trimmed = normalized.trim();
  if (!trimmed) {
    return `${LATEX_ALIGN_BEGIN}\n\n${LATEX_ALIGN_END}`;
  }
  return `${LATEX_ALIGN_BEGIN}\n${trimmed}\n${LATEX_ALIGN_END}`;
}
