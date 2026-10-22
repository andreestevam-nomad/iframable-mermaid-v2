/** Query param do modo de visualização JSON (`jvm=beautify` | `jvm=tree`). */
export const JSON_VIEW_MODE_PARAM = "jvm";

export const JSON_VIEW_MODE_BEAUTIFY = "beautify";
export const JSON_VIEW_MODE_TREE = "tree";

export const DEFAULT_JSON_VIEW_MODE = JSON_VIEW_MODE_BEAUTIFY;

/**
 * @param {unknown} value
 * @returns {"beautify" | "tree"}
 */
export function normalizeJsonViewMode(value) {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (raw === "tree" || raw === "2" || raw === "modo2" || raw === "modo-2") {
    return JSON_VIEW_MODE_TREE;
  }
  return JSON_VIEW_MODE_BEAUTIFY;
}

/**
 * @param {URLSearchParams} [params]
 * @returns {"beautify" | "tree"}
 */
export function parseJsonViewModeParam(params = new URLSearchParams()) {
  const raw = params.get(JSON_VIEW_MODE_PARAM);
  if (raw == null || raw === "") return DEFAULT_JSON_VIEW_MODE;
  return normalizeJsonViewMode(raw);
}
