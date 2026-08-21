import {
  compressToParam,
  decompressFromParam,
  URL_WARN_THRESHOLD,
} from "./compress.js";
import { formatMermaid, minifyMermaid, removeComments } from "./mermaid-text.js";
import { isD3CompatibleDiagram } from "./mermaid-to-graph.js";
import {
  compressD3Config,
  decompressD3Config,
  normalizeD3Config,
  parseD3Param,
} from "./d3-config.js";
import { bindD3ConfigDialog } from "./d3-config-dialog.js";
import { createMermaidEditor, createMermaidSourceViewer } from "./editor.js";
import { log } from "./log.js";

const DRAFT_KEY = "mermaid-draft";
const TITLE_KEY = "mermaid-title";
const AUTO_KEY = "mermaid-auto";
const AUTO_DEBOUNCE_MIN_MS = 500;
const AUTO_DEBOUNCE_MAX_MS = 1600;
const URL_DISPLAY_MAX = 160;
const RENDER_TIMEOUT_MS = 30000;
const BOOT_AUTO_MAX_CHARS = 3000;
const RENDERER_SRC = new URL("../renderer.html", import.meta.url).href;
const MERMAID_TO_EXCALIDRAW_SRC =
  "https://esm.sh/@excalidraw/mermaid-to-excalidraw@1.1.4";
const IFRAME_TARGET = "*";
/** Origem canônica das URLs compartilháveis (evita localhost no link). */
const PUBLIC_SHARE_ORIGIN = "https://andreestevam-nomad.github.io";
const PUBLIC_SHARE_PATH = "/iframable-mermaid-v2/";
/** Query param do modo zoom/pan na view compartilhada (`z=1` ligado, `z=0`/ausente desligado). */
const ZOOM_PARAM = "z";
/** Escala e centro do zoom em coords do diagrama (só com `z=1`). */
const ZOOM_SCALE_PARAM = "zs";
const ZOOM_X_PARAM = "zx";
const ZOOM_Y_PARAM = "zy";
/** Query param do tema Mermaid (`th=` + nome do tema Mermaid). */
const THEME_PARAM = "th";
const DEFAULT_THEME = "neutral";
const MERMAID_THEMES = new Set([
  "default",
  "neutral",
  "dark",
  "forest",
  "base",
  "neo",
  "neo-dark",
  "redux",
  "redux-dark",
  "redux-color",
  "redux-dark-color",
]);
/** Query param do painel de código (`mmd=show` expandido, `mmd=hide`/ausente recolhido). */
const MMD_PARAM = "mmd";
/** Query param do modo minimalista na view compartilhada (`only=1` esconde botões/código). */
const ONLY_PARAM = "only";
/** Query param que retorna o código Mermaid como texto puro, sem a UI (`raw=1`). */
const RAW_PARAM = "raw";
/** Query param do modo D3 force (`d3=1`). */
const D3_PARAM = "d3";
/** Query param compactado das configurações D3 (`d3c=`). */
const D3_CONFIG_PARAM = "d3c";

const views = {
  input: document.getElementById("view-input"),
  output: document.getElementById("view-output"),
};

const els = {
  editorHost: document.getElementById("editor"),
  previewFrame: document.getElementById("preview-frame"),
  previewError: document.getElementById("preview-error"),
  previewStatus: document.getElementById("preview-status"),
  btnRenderPreview: document.getElementById("btn-render-preview"),
  chkAuto: document.getElementById("chk-auto"),
  chkZoomPreview: document.getElementById("chk-zoom-preview"),
  chkShowMmd: document.getElementById("chk-show-mmd"),
  chkDiagramOnly: document.getElementById("chk-diagram-only"),
  chkD3Force: document.getElementById("chk-d3-force"),
  d3ForceOption: document.querySelector(".d3-force-option"),
  btnD3Config: document.getElementById("btn-d3-config"),
  btnD3GraphConfig: document.getElementById("btn-d3-graph-config"),
  d3ConfigDialog: document.getElementById("d3-config-dialog"),
  btnPreviewSettings: document.getElementById("btn-preview-settings"),
  previewSettingsDialog: document.getElementById("preview-settings-dialog"),
  btnPreviewDownload: document.getElementById("btn-preview-download"),
  previewDownloadMenu: document.getElementById("preview-download-menu"),
  btnExportPreviewPng: document.getElementById("btn-export-preview-png"),
  btnExportPreviewMmd: document.getElementById("btn-export-preview-mmd"),
  btnExportOutputPng: document.getElementById("btn-export-output-png"),
  btnExportOutputMmd: document.getElementById("btn-export-output-mmd"),
  btnRawSource: document.getElementById("btn-raw-source"),
  btnExportPreviewExcalidraw: document.getElementById(
    "btn-export-preview-excalidraw",
  ),
  btnExportOutputExcalidraw: document.getElementById(
    "btn-export-output-excalidraw",
  ),
  outputActions: document.querySelector(".output-actions"),
  status: document.getElementById("status"),
  titleInput: document.getElementById("diagram-title"),
  btnGenerateUrl: document.getElementById("btn-generate-url"),
  btnCopyUrl: document.getElementById("btn-copy-url"),
  btnOpenInput: document.getElementById("btn-open-input"),
  btnStripComments: document.getElementById("btn-strip-comments"),
  btnFormat: document.getElementById("btn-format"),
  btnMinify: document.getElementById("btn-minify"),
  urlCharCount: document.getElementById("url-char-count"),
  urlPreviewText: document.getElementById("url-preview-text"),
  urlLengthMeter: document.querySelector(".url-length-meter"),
  urlLengthMeterFill: document.getElementById("url-length-meter-fill"),
  outputTitle: document.getElementById("output-title"),
  outputFrame: document.getElementById("output-frame"),
  outputError: document.getElementById("output-error"),
  outputSource: document.getElementById("output-source"),
  outputSourceViewer: document.getElementById("output-source-viewer"),
  outputSourceCode: document.getElementById("output-source-code"),
  btnCopySource: document.getElementById("btn-copy-source"),
  btnToggleSource: document.getElementById("btn-toggle-source"),
  btnZoomMode: document.getElementById("btn-zoom-mode"),
  btnFullscreen: document.getElementById("btn-fullscreen"),
  btnEdit: document.getElementById("btn-edit"),
  btnOpenOutput: document.getElementById("btn-open-output"),
  fullscreenTarget: document.getElementById("fullscreen-target"),
  btnHelp: document.getElementById("btn-help"),
  helpDialog: document.getElementById("help-dialog"),
  selTheme: document.getElementById("sel-theme"),
};

/** @type {ReturnType<typeof createMermaidEditor> | null} */
let editor = null;
/** @type {ReturnType<typeof createMermaidSourceViewer> | null} */
let sourceViewer = null;
let persistTimer = null;
let autoTimer = null;
let urlSeq = 0;
let cachedShareUrl = "";
let cachedShareTitle = "";
let cachedShareTheme = "";
let cachedShareZoom = false;
let cachedShareMmd = false;
let cachedShareOnly = false;
let cachedShareD3 = false;
let cachedShareD3ConfigKey = "";
let cachedShareViewKey = "";
let urlEpoch = -1;
let urlBusy = false;
let shareUrlTimer = null;
let requestSeq = 0;
let inputBound = false;
let editorEpoch = 0;
let previewEpoch = -1;
let lastPreviewCode = null;
let lastOutputCode = null;
let lastOutputContentHeight = 280;
let resizeTimer = null;
/** Modo zoom/pan na view compartilhada (desligado por padrão; ver `?z=`). */
let zoomModeEnabled = false;
/** @type {{ scale: number, cx: number, cy: number } | null} */
let zoomView = null;
/** Tema Mermaid ativo (default: neutral). */
let diagramTheme = DEFAULT_THEME;
/** Painel de código expandido na view compartilhada (`?mmd=show|hide`). */
let sourceExpanded = false;
/** Preferências do editor que entram na URL compartilhada. */
let previewZoomEnabled = false;
/** @type {{ scale: number, cx: number, cy: number } | null} */
let previewZoomView = null;
let shareShowMmd = false;
/** Página compartilhada mostra só título + diagrama, sem botões/código (`?only=1`). */
let onlyDiagram = false;
let shareOnlyDiagram = false;
/** Modo D3 force para graph/flowchart/mindmap. */
let d3ForceEnabled = false;
let shareD3Force = false;
/** @type {import('./d3-config.js').D3Config} */
let d3Config = normalizeD3Config(null);
/** @type {ReturnType<typeof bindD3ConfigDialog> | null} */
let d3ConfigUi = null;

/** @type {WeakMap<HTMLIFrameElement, Promise<void>>} */
const readyMap = new WeakMap();
/** @type {Map<number, { resolve: Function, reject: Function, iframe: HTMLIFrameElement, timer: number, kind?: string }>} */
const pending = new Map();

function getEditorValue() {
  return editor?.getValue() ?? "";
}

function getDiagramTitle() {
  return (els.titleInput?.value || "").trim();
}

function setDiagramTitle(title) {
  if (!els.titleInput) return;
  els.titleInput.value = title ?? "";
}

function persistTitle() {
  try {
    sessionStorage.setItem(TITLE_KEY, getDiagramTitle());
  } catch {
    // ignore
  }
}

function restoreTitle(preferred) {
  if (!els.titleInput) return;
  if (preferred != null && preferred !== "") {
    setDiagramTitle(preferred);
    return;
  }
  try {
    const stored = sessionStorage.getItem(TITLE_KEY);
    if (stored) setDiagramTitle(stored);
  } catch {
    // ignore
  }
}

function showView(name) {
  views.input.hidden = name !== "input";
  views.output.hidden = name !== "output";
  document.body.dataset.view = name;
  if (name !== "output") {
    syncD3OutputLayout(false);
  }
}

function setStatus(message, tone = "muted") {
  els.status.textContent = message;
  els.status.dataset.tone = tone;
}

function showRenderError(container, message, retryFn) {
  if (!container) return;
  container.textContent = "";
  container.hidden = false;

  const text = document.createElement("span");
  text.className = "error-box-message";
  text.textContent = message;
  container.appendChild(text);

  if (typeof retryFn !== "function") return;

  const retryBtn = document.createElement("button");
  retryBtn.type = "button";
  retryBtn.className = "btn-inline error-box-retry";
  retryBtn.textContent = "Recarregar";
  retryBtn.onclick = () => {
    retryBtn.disabled = true;
    retryBtn.textContent = "Recarregando…";
    void Promise.resolve(retryFn()).finally(() => {
      retryBtn.disabled = false;
      retryBtn.textContent = "Recarregar";
    });
  };
  container.appendChild(retryBtn);
}

function setPreviewStatus(message) {
  if (!els.previewStatus) return;
  els.previewStatus.textContent = message || "";
  els.previewStatus.hidden = !message;
}

function isFromRenderer(event) {
  return (
    event.source === els.previewFrame?.contentWindow ||
    event.source === els.outputFrame?.contentWindow
  );
}

function isAllowedRendererOrigin(origin) {
  return origin === window.location.origin || origin === "null";
}

function postToRenderer(iframe, payload) {
  iframe.contentWindow?.postMessage(payload, IFRAME_TARGET);
}

function isLocalHost(hostname = window.location.hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".local")
  );
}

/** Base da URL pública (Pages), mesmo quando a app roda em localhost. */
function getShareBaseUrl() {
  if (isLocalHost()) {
    return new URL(PUBLIC_SHARE_PATH, PUBLIC_SHARE_ORIGIN);
  }

  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  // Normaliza para a pasta do app (…/repo/), sem index.html.
  let path = url.pathname;
  if (path.endsWith(".html")) {
    path = path.replace(/[^/]+$/u, "");
  }
  if (!path.endsWith("/")) {
    path += "/";
  }
  url.pathname = path;
  return url;
}

function parseZoomParam(params = new URLSearchParams(window.location.search)) {
  const raw = params.get(ZOOM_PARAM);
  if (raw == null || raw === "") return false;
  const value = String(raw).trim().toLowerCase();
  return value === "1" || value === "true" || value === "on" || value === "yes";
}

function formatViewNumber(value) {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded);
}

function normalizeZoomView(view) {
  if (!view || typeof view !== "object") return null;
  const scale = Number(view.scale);
  const cx = Number(view.cx);
  const cy = Number(view.cy);
  if (!Number.isFinite(scale) || scale <= 0) return null;
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  return { scale, cx, cy };
}

function parseZoomView(params = new URLSearchParams(window.location.search)) {
  if (!parseZoomParam(params)) return null;
  return normalizeZoomView({
    scale: params.get(ZOOM_SCALE_PARAM),
    cx: params.get(ZOOM_X_PARAM),
    cy: params.get(ZOOM_Y_PARAM),
  });
}

function syncZoomQueryParam() {
  if (views.output.hidden) return;
  const url = new URL(window.location.href);
  url.searchParams.set(ZOOM_PARAM, zoomModeEnabled ? "1" : "0");
  if (zoomModeEnabled && zoomView) {
    url.searchParams.set(ZOOM_SCALE_PARAM, formatViewNumber(zoomView.scale));
    url.searchParams.set(ZOOM_X_PARAM, formatViewNumber(zoomView.cx));
    url.searchParams.set(ZOOM_Y_PARAM, formatViewNumber(zoomView.cy));
  } else {
    url.searchParams.delete(ZOOM_SCALE_PARAM);
    url.searchParams.delete(ZOOM_X_PARAM);
    url.searchParams.delete(ZOOM_Y_PARAM);
  }
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next !== current) {
    window.history.replaceState({}, "", next);
  }
}

function normalizeTheme(value) {
  const theme = String(value || "")
    .trim()
    .toLowerCase();
  return MERMAID_THEMES.has(theme) ? theme : DEFAULT_THEME;
}

function parseThemeParam(params = new URLSearchParams(window.location.search)) {
  const raw = params.get(THEME_PARAM);
  if (raw == null || raw === "") return DEFAULT_THEME;
  return normalizeTheme(raw);
}

function syncThemeSelect() {
  if (!els.selTheme) return;
  els.selTheme.value = diagramTheme;
}

function parseMmdParam(params = new URLSearchParams(window.location.search)) {
  const raw = params.get(MMD_PARAM);
  if (raw == null || raw === "") return false;
  const value = String(raw).trim().toLowerCase();
  return value === "show" || value === "1" || value === "true" || value === "on";
}

function syncMmdQueryParam() {
  if (views.output.hidden) return;
  const url = new URL(window.location.href);
  url.searchParams.set(MMD_PARAM, sourceExpanded ? "show" : "hide");
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next !== current) {
    window.history.replaceState({}, "", next);
  }
}

function parseOnlyParam(params = new URLSearchParams(window.location.search)) {
  const raw = params.get(ONLY_PARAM);
  if (raw == null || raw === "") return false;
  const value = String(raw).trim().toLowerCase();
  return value === "1" || value === "true" || value === "on" || value === "yes";
}

function syncOnlyQueryParam() {
  if (views.output.hidden) return;
  const url = new URL(window.location.href);
  url.searchParams.set(ONLY_PARAM, onlyDiagram ? "1" : "0");
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next !== current) {
    window.history.replaceState({}, "", next);
  }
}

function applyOnlyDiagramUi() {
  if (els.outputActions) {
    els.outputActions.hidden = onlyDiagram;
  }
  if (els.outputSource && !els.outputSource.hidden) {
    els.outputSource.hidden = onlyDiagram;
  }
}

function ensureSourceViewer() {
  if (sourceViewer || !els.outputSourceViewer) return;
  sourceViewer = createMermaidSourceViewer({
    parent: els.outputSourceViewer,
    doc: lastOutputCode || els.outputSourceCode?.value || "",
  });
}

function setButtonLabel(button, label) {
  if (!button) return;
  const labelEl = button.querySelector(".btn-label");
  if (labelEl) {
    labelEl.textContent = label;
  }
  button.setAttribute("aria-label", label);
  button.title = label;
}

function syncSourceExpandedUi() {
  if (els.outputSource) {
    els.outputSource.dataset.mmd = sourceExpanded ? "show" : "hide";
  }
  if (els.btnToggleSource) {
    const label = sourceExpanded
      ? "Ocultar código Mermaid"
      : "Ver código Mermaid";
    els.btnToggleSource.setAttribute(
      "aria-pressed",
      sourceExpanded ? "true" : "false",
    );
    setButtonLabel(els.btnToggleSource, label);
  }
  if (sourceExpanded) {
    ensureSourceViewer();
    sourceViewer?.setValue(lastOutputCode || els.outputSourceCode?.value || "");
  }
}

function zoomViewCacheKey(view) {
  const normalized = normalizeZoomView(view);
  if (!normalized) return "";
  return [
    formatViewNumber(normalized.scale),
    formatViewNumber(normalized.cx),
    formatViewNumber(normalized.cy),
  ].join("|");
}

function buildShareUrl(
  param,
  title = getDiagramTitle(),
  {
    zoom = false,
    view = null,
    theme = diagramTheme,
    mmd = false,
    only = false,
    d3 = false,
    d3ConfigParam = "",
  } = {},
) {
  const url = getShareBaseUrl();
  url.search = "";
  url.hash = "";
  url.searchParams.set("d", param);
  const cleanTitle = String(title || "").trim();
  if (cleanTitle) {
    url.searchParams.set("t", cleanTitle);
  }
  const nextTheme = normalizeTheme(theme);
  // Omite th quando é o padrão (neutral) para URLs mais curtas.
  if (nextTheme !== DEFAULT_THEME) {
    url.searchParams.set(THEME_PARAM, nextTheme);
  }
  // Padrão desligado: só inclui z=1 quando o link deve abrir com zoom.
  if (zoom) {
    url.searchParams.set(ZOOM_PARAM, "1");
    const normalized = normalizeZoomView(view);
    if (normalized) {
      url.searchParams.set(ZOOM_SCALE_PARAM, formatViewNumber(normalized.scale));
      url.searchParams.set(ZOOM_X_PARAM, formatViewNumber(normalized.cx));
      url.searchParams.set(ZOOM_Y_PARAM, formatViewNumber(normalized.cy));
    }
  }
  // Padrão hide: só inclui mmd=show quando marcado no editor.
  if (mmd) {
    url.searchParams.set(MMD_PARAM, "show");
  }
  // Padrão desligado: só inclui only=1 quando marcado no editor.
  if (only) {
    url.searchParams.set(ONLY_PARAM, "1");
  }
  if (d3) {
    url.searchParams.set(D3_PARAM, "1");
    if (d3ConfigParam) {
      url.searchParams.set(D3_CONFIG_PARAM, d3ConfigParam);
    }
  }
  return url.toString();
}

function d3ConfigCacheKey(config = d3Config) {
  return serializeD3ConfigForCache(normalizeD3Config(config));
}

function serializeD3ConfigForCache(config) {
  return JSON.stringify(normalizeD3Config(config));
}

function isPreviewD3Active(code = getEditorValue()) {
  return d3ForceEnabled && isD3CompatibleDiagram(code);
}

function isPreviewExpandEnabled(code = getEditorValue()) {
  return previewZoomEnabled || isPreviewD3Active(code);
}

function syncD3ControlsVisibility() {
  const compatible = isD3CompatibleDiagram(getEditorValue());
  if (els.d3ForceOption) {
    els.d3ForceOption.hidden = !compatible;
  }
  if (!compatible && d3ForceEnabled) {
    d3ForceEnabled = false;
    shareD3Force = false;
  }
  if (els.chkD3Force) {
    els.chkD3Force.checked = d3ForceEnabled;
  }
  if (els.btnD3Config) {
    els.btnD3Config.hidden = !(compatible && d3ForceEnabled);
  }
  if (els.btnD3GraphConfig) {
    els.btnD3GraphConfig.hidden = !(compatible && d3ForceEnabled);
  }
  document.body.dataset.d3Force = d3ForceEnabled ? "on" : "off";
}

function syncD3OutputLayout(enabled = false) {
  document.body.dataset.d3Output = enabled ? "on" : "off";
}

function setPreviewDownloadMenuOpen(open) {
  if (!els.previewDownloadMenu || !els.btnPreviewDownload) return;
  const next = Boolean(open);
  els.previewDownloadMenu.hidden = !next;
  els.btnPreviewDownload.setAttribute("aria-expanded", next ? "true" : "false");
  els.btnPreviewDownload.classList.toggle("is-open", next);
}

function closePreviewDownloadMenu() {
  setPreviewDownloadMenuOpen(false);
}

function togglePreviewDownloadMenu() {
  setPreviewDownloadMenuOpen(els.previewDownloadMenu?.hidden !== false);
}

function openPreviewSettingsDialog() {
  if (!els.previewSettingsDialog) return;
  syncD3ControlsVisibility();
  if (typeof els.previewSettingsDialog.showModal === "function") {
    els.previewSettingsDialog.showModal();
  }
}

function bindPreviewToolbar() {
  els.btnPreviewSettings?.addEventListener("click", () => {
    openPreviewSettingsDialog();
  });

  els.previewSettingsDialog?.addEventListener("click", (event) => {
    if (event.target === els.previewSettingsDialog) {
      els.previewSettingsDialog.close();
    }
  });

  els.btnPreviewDownload?.addEventListener("click", (event) => {
    event.stopPropagation();
    togglePreviewDownloadMenu();
  });

  document.addEventListener("click", (event) => {
    if (!els.previewDownloadMenu || els.previewDownloadMenu.hidden) return;
    const target = /** @type {Node | null} */ (event.target);
    if (target && els.btnPreviewDownload?.contains(target)) return;
    if (target && els.previewDownloadMenu.contains(target)) {
      closePreviewDownloadMenu();
      return;
    }
    closePreviewDownloadMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (exitOutputToEditor()) return;
    closePreviewDownloadMenu();
  });
}

function syncEditorShareControls() {
  if (els.chkZoomPreview) {
    els.chkZoomPreview.checked = previewZoomEnabled;
  }
  if (els.chkShowMmd) {
    els.chkShowMmd.checked = shareShowMmd;
  }
  if (els.chkDiagramOnly) {
    els.chkDiagramOnly.checked = shareOnlyDiagram;
  }
  if (els.chkD3Force) {
    els.chkD3Force.checked = d3ForceEnabled;
  }
  syncD3ControlsVisibility();
  document.body.dataset.previewZoom = isPreviewExpandEnabled() ? "on" : "off";
}

function scheduleShareUrlRefresh() {
  clearTimeout(shareUrlTimer);
  shareUrlTimer = setTimeout(() => {
    if (isAutoEnabled() && editorHasCode()) {
      void refreshUrlPreview({ quiet: true });
      return;
    }
    invalidateUrlPreview();
  }, 280);
}

async function setPreviewZoomMode(enabled) {
  previewZoomEnabled = Boolean(enabled);
  if (!previewZoomEnabled) {
    previewZoomView = null;
  }
  syncEditorShareControls();
  scheduleShareUrlRefresh();
  try {
    await ensureRenderer(els.previewFrame);
    const effectiveExpand = isPreviewExpandEnabled();
    if (lastPreviewCode != null && String(lastPreviewCode).trim()) {
      postToRenderer(els.previewFrame, {
        type: "set-zoom-mode",
        enabled: effectiveExpand,
        view: previewZoomEnabled ? previewZoomView : null,
      });
      if (isPreviewD3Active(lastPreviewCode)) {
        requestAnimationFrame(() => {
          postToRenderer(els.previewFrame, { type: "fit-view" });
        });
      }
      return;
    }
    if (editorHasCode()) {
      await renderPreview(getEditorValue());
    }
  } catch (error) {
    setStatus(error?.message || String(error), "error");
  }
}

function onPreviewZoomChanged() {
  void setPreviewZoomMode(Boolean(els.chkZoomPreview?.checked));
}

function onShowMmdChanged() {
  shareShowMmd = Boolean(els.chkShowMmd?.checked);
  syncEditorShareControls();
  scheduleShareUrlRefresh();
}

function onDiagramOnlyChanged() {
  shareOnlyDiagram = Boolean(els.chkDiagramOnly?.checked);
  syncEditorShareControls();
  scheduleShareUrlRefresh();
}

function onD3ForceChanged() {
  const wasEnabled = d3ForceEnabled;
  d3ForceEnabled = Boolean(els.chkD3Force?.checked);
  shareD3Force = d3ForceEnabled;
  if (
    d3ForceEnabled &&
    !wasEnabled &&
    isD3CompatibleDiagram(getEditorValue())
  ) {
    previewZoomEnabled = true;
    if (els.chkZoomPreview) els.chkZoomPreview.checked = true;
    document.body.dataset.previewZoom = "on";
  }
  syncEditorShareControls();
  scheduleShareUrlRefresh();
  if (editorHasCode()) {
    void renderPreview(getEditorValue());
  }
}

function onD3ConfigApplied(nextConfig) {
  d3Config = normalizeD3Config(nextConfig);
  d3ConfigUi?.setConfig(d3Config);
  scheduleShareUrlRefresh();
  if (d3ForceEnabled && editorHasCode()) {
    void renderPreview(getEditorValue());
  }
}

function isAutoEnabled() {
  return Boolean(els.chkAuto?.checked);
}

function autoDebounceMs(code) {
  const len = code.length;
  if (len < 2000) return AUTO_DEBOUNCE_MIN_MS;
  if (len > 6000) return AUTO_DEBOUNCE_MAX_MS;
  return (
    AUTO_DEBOUNCE_MIN_MS +
    Math.round((len / 6000) * (AUTO_DEBOUNCE_MAX_MS - AUTO_DEBOUNCE_MIN_MS))
  );
}

function editorHasCode() {
  const value = getEditorValue();
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code !== 32 && code !== 9 && code !== 10 && code !== 13) {
      return true;
    }
  }
  return false;
}

function updatePreviewMode({ autoPending = false } = {}) {
  const hasCode = editorHasCode();
  if (els.btnRenderPreview) {
    els.btnRenderPreview.hidden = !hasCode;
  }
  if (!hasCode) {
    setPreviewStatus("");
    return;
  }
  if (previewEpoch === editorEpoch) {
    setPreviewStatus("");
    return;
  }
  if (isAutoEnabled()) {
    setPreviewStatus(
      autoPending
        ? "Modo auto: atualizando…"
        : "Modo auto ligado — alterações agendadas.",
    );
  } else {
    setPreviewStatus('Clique em “Atualizar preview” para renderizar.');
  }
}

function truncateUrl(url) {
  if (url.length <= URL_DISPLAY_MAX) return url;
  const head = Math.floor(URL_DISPLAY_MAX * 0.55);
  const tail = URL_DISPLAY_MAX - head - 1;
  return `${url.slice(0, head)}…${url.slice(-tail)}`;
}

function ensureRenderer(iframe) {
  const existing = readyMap.get(iframe);
  if (existing) return existing;

  const readyPromise = new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      readyMap.delete(iframe);
      reject(new Error("Timeout ao carregar o renderer Mermaid."));
    }, RENDER_TIMEOUT_MS);

    function onMessage(event) {
      if (event.source !== iframe.contentWindow) return;
      if (event.data?.type !== "renderer-ready") return;
      cleanup();
      resolve();
    }

    function cleanup() {
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
    }

    window.addEventListener("message", onMessage);
    iframe.addEventListener(
      "load",
      () => {
        try {
          postToRenderer(iframe, { type: "ping" });
        } catch {
          // ignore
        }
      },
      { once: true },
    );
    iframe.src = RENDERER_SRC;
  });

  readyMap.set(iframe, readyPromise);
  return readyPromise;
}

function reloadRenderer(iframe) {
  readyMap.delete(iframe);
  return ensureRenderer(iframe);
}

function failPendingFor(iframe, reason) {
  for (const [id, entry] of [...pending]) {
    if (entry.iframe !== iframe) continue;
    window.clearTimeout(entry.timer);
    pending.delete(id);
    entry.reject(reason);
  }
}

function syncZoomModeUi() {
  document.body.dataset.zoom = zoomModeEnabled ? "on" : "off";
  if (!els.btnZoomMode) return;
  const label = zoomModeEnabled ? "Zoom ligado" : "Zoom desligado";
  els.btnZoomMode.setAttribute("aria-pressed", zoomModeEnabled ? "true" : "false");
  setButtonLabel(els.btnZoomMode, label);
  els.btnZoomMode.classList.toggle("primary", zoomModeEnabled);
}

function applyOutputHeight(contentHeight) {
  if (document.fullscreenElement === els.fullscreenTarget) {
    els.outputFrame.style.height = "100%";
    return;
  }
  if (document.body.dataset.d3Output === "on") {
    els.outputFrame.style.height = "100%";
    return;
  }
  if (zoomModeEnabled) {
    els.outputFrame.style.height = `${Math.max(window.innerHeight, 320)}px`;
    return;
  }
  const safe = Math.max(120, Math.ceil(Number(contentHeight) || lastOutputContentHeight || 120));
  lastOutputContentHeight = safe;
  els.outputFrame.style.height = `${safe}px`;
}

function requestOutputView() {
  if (!zoomModeEnabled && document.body.dataset.d3Output !== "on") return;
  try {
    if (zoomView) {
      postToRenderer(els.outputFrame, { type: "set-view", view: zoomView });
    } else {
      postToRenderer(els.outputFrame, { type: "fit-view" });
    }
  } catch {
    /* iframe indisponível */
  }
}

async function setZoomMode(enabled) {
  zoomModeEnabled = Boolean(enabled);
  if (!zoomModeEnabled) {
    zoomView = null;
  }
  syncZoomModeUi();
  syncZoomQueryParam();
  applyOutputHeight(lastOutputContentHeight);
  try {
    await ensureRenderer(els.outputFrame);
    postToRenderer(els.outputFrame, {
      type: "set-zoom-mode",
      enabled: zoomModeEnabled,
      view: zoomModeEnabled ? zoomView : null,
    });
  } catch (error) {
    setStatus(error?.message || String(error), "error");
  }
}

function toggleZoomMode() {
  void setZoomMode(!zoomModeEnabled);
}

async function renderInFrame(
  iframe,
  code,
  {
    expand = false,
    view = null,
    theme = diagramTheme,
    useD3 = false,
    d3Config: nextD3Config = d3Config,
  } = {},
) {
  await ensureRenderer(iframe);
  const requestId = ++requestSeq;
  const nextView = expand ? normalizeZoomView(view) : null;
  const nextTheme = normalizeTheme(theme);
  const d3Enabled = Boolean(useD3);

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pending.delete(requestId);
      failPendingFor(
        iframe,
        new Error("Render cancelado após timeout do renderer."),
      );
      void reloadRenderer(iframe).finally(() => {
        reject(
          new Error("Timeout ao renderizar o diagrama (renderer reiniciado)."),
        );
      });
    }, RENDER_TIMEOUT_MS);

    pending.set(requestId, {
      resolve,
      reject,
      iframe,
      timer,
      expand,
      kind: "render",
    });

    try {
      postToRenderer(iframe, {
        type: "render",
        code,
        requestId,
        expand,
        view: nextView,
        theme: nextTheme,
        useD3: d3Enabled,
        d3Config: d3Enabled ? normalizeD3Config(nextD3Config) : null,
      });
    } catch (error) {
      window.clearTimeout(timer);
      pending.delete(requestId);
      reject(error);
    }
  });
}

async function parseInPreview(code) {
  await ensureRenderer(els.previewFrame);
  const requestId = ++requestSeq;

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pending.delete(requestId);
      reject(new Error("Timeout ao validar Mermaid."));
    }, 10000);

    pending.set(requestId, {
      resolve,
      reject,
      iframe: els.previewFrame,
      timer,
      kind: "parse",
    });

    try {
      postToRenderer(els.previewFrame, { type: "parse", code, requestId });
    } catch (error) {
      window.clearTimeout(timer);
      pending.delete(requestId);
      reject(error);
    }
  });
}

function requestPngExport(iframe) {
  return ensureRenderer(iframe).then(
    () =>
      new Promise((resolve, reject) => {
        const requestId = ++requestSeq;
        const timer = window.setTimeout(() => {
          pending.delete(requestId);
          reject(new Error("Timeout ao exportar PNG."));
        }, RENDER_TIMEOUT_MS);

        pending.set(requestId, {
          resolve,
          reject,
          iframe,
          timer,
          kind: "export-png",
        });

        try {
          postToRenderer(iframe, { type: "export-png", requestId });
        } catch (error) {
          window.clearTimeout(timer);
          pending.delete(requestId);
          reject(error);
        }
      }),
  );
}

function sanitizeFilenameBase(title) {
  const clean = String(title || "").trim();
  if (!clean) return "diagrama-mermaid";
  return (
    clean
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "diagrama-mermaid"
  );
}

function triggerDownload(href, filename) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function downloadDataUrl(dataUrl, filename) {
  triggerDownload(dataUrl, filename);
}

function downloadText(text, filename) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    triggerDownload(url, filename);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

async function exportPreviewPng() {
  try {
    if (!lastPreviewCode || !String(lastPreviewCode).trim()) {
      setStatus("Renderize o preview antes de salvar o PNG.", "warn");
      return;
    }
    const { dataUrl } = await requestPngExport(els.previewFrame);
    downloadDataUrl(dataUrl, `${sanitizeFilenameBase(getDiagramTitle())}.png`);
    setStatus("PNG salvo.", "ok");
  } catch (error) {
    setStatus(error?.message || String(error), "error");
  }
}

function exportPreviewMmd() {
  const code = getEditorValue();
  if (!code.trim()) {
    setStatus("Nenhum código para salvar.", "warn");
    return;
  }
  downloadText(code, `${sanitizeFilenameBase(getDiagramTitle())}.mmd`);
  setStatus(".mmd salvo.", "ok");
}

async function exportOutputPng() {
  try {
    if (!lastOutputCode) {
      setStatus("Nenhum diagrama renderizado.", "warn");
      return;
    }
    const { dataUrl } = await requestPngExport(els.outputFrame);
    const title = els.outputTitle?.hidden ? "" : els.outputTitle?.textContent;
    downloadDataUrl(dataUrl, `${sanitizeFilenameBase(title)}.png`);
    setStatus("PNG salvo.", "ok");
  } catch (error) {
    setStatus(error?.message || String(error), "error");
  }
}

function exportOutputMmd() {
  const code = lastOutputCode || els.outputSourceCode?.value || "";
  if (!code.trim()) {
    setStatus("Nenhum código para salvar.", "warn");
    return;
  }
  const title = els.outputTitle?.hidden ? "" : els.outputTitle?.textContent;
  downloadText(code, `${sanitizeFilenameBase(title)}.mmd`);
  setStatus(".mmd salvo.", "ok");
}

/** @type {Promise<{parseMermaidToExcalidraw: Function}> | null} */
let mermaidToExcalidrawModule = null;

function loadMermaidToExcalidraw() {
  if (!mermaidToExcalidrawModule) {
    mermaidToExcalidrawModule = import(MERMAID_TO_EXCALIDRAW_SRC);
  }
  return mermaidToExcalidrawModule;
}

async function exportAsExcalidraw(code, filenameBase) {
  const trimmed = String(code || "").trim();
  if (!trimmed) {
    setStatus("Nenhum código para converter.", "warn");
    return;
  }
  setStatus("Convertendo para Excalidraw…", "muted");
  try {
    const { parseMermaidToExcalidraw } = await loadMermaidToExcalidraw();
    const { elements, files } = await parseMermaidToExcalidraw(trimmed);
    const doc = {
      type: "excalidraw",
      version: 2,
      source: "https://excalidraw.com",
      elements,
      appState: {},
      files: files || {},
    };
    downloadText(JSON.stringify(doc), `${filenameBase}.excalidraw`);
    setStatus("Excalidraw salvo.", "ok");
  } catch (error) {
    setStatus(error?.message || String(error), "error");
  }
}

function exportPreviewExcalidraw() {
  return exportAsExcalidraw(
    getEditorValue(),
    sanitizeFilenameBase(getDiagramTitle()),
  );
}

function exportOutputExcalidraw() {
  const code = lastOutputCode || els.outputSourceCode?.value || "";
  const title = els.outputTitle?.hidden ? "" : els.outputTitle?.textContent;
  return exportAsExcalidraw(code, sanitizeFilenameBase(title));
}

function openRawSource() {
  const url = new URL(window.location.href);
  url.searchParams.set(RAW_PARAM, "1");
  window.open(url.toString(), "_blank", "noopener,noreferrer");
}

function onRendererMessage(event) {
  if (!isAllowedRendererOrigin(event.origin)) return;
  if (!isFromRenderer(event)) return;
  const data = event.data;
  if (!data) return;

  if (data.type === "user-escape") {
    if (event.source !== els.outputFrame?.contentWindow) return;
    exitOutputToEditor();
    return;
  }

  if (data.type === "view-changed") {
    const nextView = normalizeZoomView({
      scale: data.scale,
      cx: data.cx,
      cy: data.cy,
    });
    if (!nextView) return;

    if (event.source === els.previewFrame?.contentWindow) {
      if (!previewZoomEnabled) return;
      previewZoomView = nextView;
      scheduleShareUrlRefresh();
      return;
    }

    if (event.source !== els.outputFrame?.contentWindow) return;
    if (!zoomModeEnabled) return;
    zoomView = nextView;
    syncZoomQueryParam();
    return;
  }

  if (data.type === "zoom-mode-changed") {
    if (event.source === els.previewFrame?.contentWindow) {
      return;
    }
    if (event.source !== els.outputFrame?.contentWindow) return;
    if (typeof data.height === "number") {
      lastOutputContentHeight = Math.max(120, Math.ceil(data.height));
    }
    applyOutputHeight(data.height);
    if (zoomModeEnabled) {
      requestAnimationFrame(() => requestOutputView());
    }
    return;
  }

  if (data.type === "parse-result") {
    const entry = pending.get(data.requestId);
    if (!entry || entry.kind !== "parse") return;
    if (event.source !== entry.iframe.contentWindow) return;
    window.clearTimeout(entry.timer);
    pending.delete(data.requestId);
    entry.resolve({ ok: Boolean(data.ok), error: data.error || undefined });
    return;
  }

  if (data.type === "png-result") {
    const entry = pending.get(data.requestId);
    if (!entry || entry.kind !== "export-png") return;
    if (event.source !== entry.iframe.contentWindow) return;
    window.clearTimeout(entry.timer);
    pending.delete(data.requestId);
    if (data.ok) {
      entry.resolve({ dataUrl: data.dataUrl });
    } else {
      entry.reject(new Error(data.error || "Falha ao exportar PNG."));
    }
    return;
  }

  if (data.type !== "render-result") return;

  const entry = pending.get(data.requestId);
  if (!entry || entry.kind === "parse" || entry.kind === "export-png") return;
  if (event.source !== entry.iframe.contentWindow) return;

  window.clearTimeout(entry.timer);
  pending.delete(data.requestId);

  if (data.skipped) {
    entry.resolve(data);
    return;
  }

  if (entry.iframe === els.outputFrame) {
    if (typeof data.height === "number" && !zoomModeEnabled && document.body.dataset.d3Output !== "on") {
      lastOutputContentHeight = Math.max(120, Math.ceil(data.height));
    }
    applyOutputHeight(data.height);
    if (zoomModeEnabled || document.body.dataset.d3Output === "on") {
      requestAnimationFrame(() => requestOutputView());
    }
  }

  if (data.ok) {
    entry.resolve(data);
  } else {
    entry.reject(new Error(data.error || "Falha ao renderizar Mermaid."));
  }
}

async function renderPreview(code) {
  const epochAtStart = editorEpoch;
  els.previewError.hidden = true;
  els.previewError.textContent = "";
  setPreviewStatus(code.trim() ? "Renderizando preview…" : "");

  try {
    await renderInFrame(els.previewFrame, code, {
      expand: isPreviewExpandEnabled(code),
      view: previewZoomView,
      theme: diagramTheme,
      useD3: d3ForceEnabled && isD3CompatibleDiagram(code),
      d3Config,
    });
    if (isPreviewD3Active(code)) {
      requestAnimationFrame(() => {
        postToRenderer(els.previewFrame, { type: "fit-view" });
      });
    }
    lastPreviewCode = code;
    previewEpoch = epochAtStart;
    setPreviewStatus("");
    updatePreviewMode();
  } catch (error) {
    lastPreviewCode = null;
    previewEpoch = -1;
    setPreviewStatus("");
    updatePreviewMode();
    showRenderError(els.previewError, error?.message || String(error), () =>
      renderPreview(code),
    );
  }
}

function scheduleAutoUpdate({ fromBoot = false } = {}) {
  clearTimeout(autoTimer);
  if (!isAutoEnabled()) {
    return;
  }

  const code = getEditorValue();
  if (fromBoot && code.length > BOOT_AUTO_MAX_CHARS) {
    log("auto:skip-boot-large", { chars: code.length });
    updatePreviewMode();
    return;
  }

  const wait = code.trim() ? autoDebounceMs(code) : AUTO_DEBOUNCE_MIN_MS;
  updatePreviewMode({ autoPending: true });
  if (editorHasCode() && urlEpoch !== editorEpoch) {
    setUrlPreview("Modo auto: compactando em breve…", `${code.length} chars`, "muted");
  }

  autoTimer = setTimeout(() => {
    if (!isAutoEnabled()) return;
    void renderPreview(getEditorValue());
    void refreshUrlPreview({ quiet: true });
  }, wait);
}

function onEditorContentChanged({ fromBoot = false } = {}) {
  editorEpoch += 1;
  syncD3ControlsVisibility();
  updatePreviewMode();
  invalidateUrlPreview();
  schedulePersist();
  scheduleAutoUpdate({ fromBoot });
}

function persistAutoPreference() {
  try {
    sessionStorage.setItem(AUTO_KEY, isAutoEnabled() ? "1" : "0");
  } catch {
    // ignore
  }
}

function restoreAutoPreference() {
  if (!els.chkAuto) return;
  try {
    const stored = sessionStorage.getItem(AUTO_KEY);
    // Sem preferência salva (ou valor diferente de "0"): ligado por padrão.
    // "0" preserva quando o usuário desligou manualmente.
    if (stored === null) {
      const legacy = sessionStorage.getItem("mermaid-hot-reload");
      els.chkAuto.checked = legacy !== "0";
    } else {
      els.chkAuto.checked = stored === "1";
    }
  } catch {
    els.chkAuto.checked = true;
  }
}

function schedulePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, getEditorValue());
    } catch {
      // ignore
    }
  }, 400);
}

function setUrlPreview(text, charLabel, tone = "muted", urlLength = 0) {
  if (els.urlPreviewText) {
    els.urlPreviewText.textContent = text;
  }
  if (els.urlCharCount) {
    els.urlCharCount.textContent = charLabel;
    els.urlCharCount.dataset.tone = tone;
  }
  updateUrlLengthMeter(urlLength);
}

function updateUrlLengthMeter(urlLength) {
  const meter = els.urlLengthMeter;
  const fill = els.urlLengthMeterFill;
  if (!meter || !fill) return;

  const length = Math.max(0, Number(urlLength) || 0);
  const ratio = Math.min(length / URL_WARN_THRESHOLD, 1);
  fill.style.width = `${ratio * 100}%`;

  let state = "empty";
  if (length > URL_WARN_THRESHOLD) {
    state = "over";
  } else if (length >= URL_WARN_THRESHOLD * 0.85) {
    state = "near";
  } else if (length > 0) {
    state = "ok";
  }

  fill.dataset.state = state;
  meter.dataset.state = state;
  meter.setAttribute("aria-valuemax", String(URL_WARN_THRESHOLD));
  meter.setAttribute("aria-valuenow", String(Math.round(length)));
  meter.setAttribute(
    "aria-valuetext",
    `${length} de ${URL_WARN_THRESHOLD} caracteres`,
  );
}

function invalidateUrlPreview() {
  urlSeq += 1;
  cachedShareUrl = "";
  cachedShareTitle = "";
  cachedShareTheme = "";
  cachedShareZoom = false;
  cachedShareMmd = false;
  cachedShareOnly = false;
  cachedShareD3 = false;
  cachedShareD3ConfigKey = "";
  cachedShareViewKey = "";
  urlEpoch = -1;

  const len = getEditorValue().length;
  if (!editorHasCode()) {
    setUrlPreview(
      isAutoEnabled()
        ? "Cole um diagrama para gerar a URL."
        : "Clique em “Gerar URL” após colar o diagrama.",
      "0 chars",
      "muted",
    );
    return;
  }
  setUrlPreview(
    isAutoEnabled()
      ? "Alterações pendentes — URL será atualizada."
      : "Alterações pendentes — clique em “Gerar URL”.",
    `${len} chars`,
    "muted",
  );
}

function onTitleChanged() {
  persistTitle();
  invalidateUrlPreview();
  if (isAutoEnabled() && editorHasCode()) {
    clearTimeout(autoTimer);
    autoTimer = setTimeout(() => {
      if (!isAutoEnabled()) return;
      void refreshUrlPreview({ quiet: true });
    }, AUTO_DEBOUNCE_MIN_MS);
  }
}

function setUrlButtonsBusy(busy) {
  urlBusy = busy;
  if (els.btnGenerateUrl) els.btnGenerateUrl.disabled = busy;
  if (els.btnCopyUrl) els.btnCopyUrl.disabled = busy;
  if (els.btnOpenInput) els.btnOpenInput.disabled = busy;
}

async function refreshUrlPreview({ quiet = false } = {}) {
  const seq = ++urlSeq;
  const epochAtStart = editorEpoch;
  const source = getEditorValue().trim();

  if (!source) {
    cachedShareUrl = "";
    cachedShareTitle = "";
    cachedShareTheme = "";
    cachedShareZoom = false;
    cachedShareMmd = false;
    cachedShareOnly = false;
    cachedShareD3 = false;
    cachedShareD3ConfigKey = "";
    cachedShareViewKey = "";
    urlEpoch = -1;
    setUrlPreview(
      isAutoEnabled()
        ? "Cole um diagrama para gerar a URL."
        : "Clique em “Gerar URL” após colar o diagrama.",
      "0 chars",
      "muted",
    );
    return;
  }

  setUrlButtonsBusy(true);
  setUrlPreview("Compactando…", "…", "muted");
  if (!quiet) setStatus("Compactando URL…", "muted");

  await new Promise((resolve) => setTimeout(resolve, 0));
  if (seq !== urlSeq) {
    setUrlButtonsBusy(false);
    return;
  }

  try {
    const param = await compressToParam(source);
    const title = getDiagramTitle();
    const theme = diagramTheme;
    const zoom = previewZoomEnabled;
    const view = previewZoomView;
    const mmd = shareShowMmd;
    const only = shareOnlyDiagram;
    const d3 = shareD3Force && isD3CompatibleDiagram(source);
    let d3ConfigParam = "";
    if (d3) {
      d3ConfigParam = await compressD3Config(d3Config);
    }
    const url = buildShareUrl(param, title, {
      theme,
      zoom,
      view,
      mmd,
      only,
      d3,
      d3ConfigParam,
    });
    if (seq !== urlSeq) return;

    cachedShareUrl = url;
    cachedShareTitle = title;
    cachedShareTheme = theme;
    cachedShareZoom = zoom;
    cachedShareMmd = mmd;
    cachedShareOnly = only;
    cachedShareD3 = d3;
    cachedShareD3ConfigKey = d3 ? d3ConfigCacheKey(d3Config) : "";
    cachedShareViewKey = zoomViewCacheKey(view);
    urlEpoch = epochAtStart;
    const tone = url.length > URL_WARN_THRESHOLD ? "warn" : "ok";
    const label =
      url.length > URL_WARN_THRESHOLD
        ? `${url.length} chars (longa)`
        : `${url.length} chars`;
    setUrlPreview(truncateUrl(url), label, tone, url.length);
    if (!quiet) {
      setStatus(`URL gerada (${label}).`, tone === "warn" ? "warn" : "ok");
    }
  } catch (error) {
    if (seq !== urlSeq) return;
    cachedShareUrl = "";
    cachedShareTitle = "";
    cachedShareTheme = "";
    cachedShareZoom = false;
    cachedShareMmd = false;
    cachedShareOnly = false;
    cachedShareD3 = false;
    cachedShareD3ConfigKey = "";
    cachedShareViewKey = "";
    urlEpoch = -1;
    setUrlPreview(error?.message || String(error), "erro", "warn");
    if (!quiet) setStatus(error?.message || String(error), "error");
  } finally {
    setUrlButtonsBusy(false);
  }
}

async function ensureShareUrl() {
  if (
    cachedShareUrl &&
    urlEpoch === editorEpoch &&
    cachedShareTitle === getDiagramTitle() &&
    cachedShareTheme === diagramTheme &&
    cachedShareZoom === previewZoomEnabled &&
    cachedShareMmd === shareShowMmd &&
    cachedShareOnly === shareOnlyDiagram &&
    cachedShareD3 === (shareD3Force && isD3CompatibleDiagram(getEditorValue())) &&
    cachedShareD3ConfigKey ===
      (shareD3Force && isD3CompatibleDiagram(getEditorValue())
        ? d3ConfigCacheKey(d3Config)
        : "") &&
    cachedShareViewKey === zoomViewCacheKey(previewZoomView)
  ) {
    return cachedShareUrl;
  }
  await refreshUrlPreview();
  if (!cachedShareUrl) {
    throw new Error("Não foi possível gerar a URL.");
  }
  return cachedShareUrl;
}

function applyEditorTransform(transform, successMessage) {
  const before = getEditorValue();
  const after = transform(before);
  if (after === before) {
    setStatus("Nada a alterar.", "muted");
    return;
  }
  editor?.setValue(after);
  onEditorContentChanged();
  setStatus(`${successMessage} (${before.length} → ${after.length} chars).`, "ok");
}

async function copyShareUrl() {
  try {
    const url = await ensureShareUrl();
    await navigator.clipboard.writeText(url);
    if (url.length > URL_WARN_THRESHOLD) {
      setStatus(
        `URL copiada (${url.length} chars — pode falhar em alguns apps).`,
        "warn",
      );
    } else {
      setStatus(`URL copiada (${url.length} chars).`, "ok");
    }
  } catch (error) {
    setStatus(error?.message || String(error), "error");
  }
}

async function openShareInNewTab() {
  try {
    const url = await ensureShareUrl();
    window.open(url, "_blank", "noopener,noreferrer");
    if (url.length > URL_WARN_THRESHOLD) {
      setStatus(
        `Aberta em nova guia (${url.length} chars — URL longa).`,
        "warn",
      );
    } else {
      setStatus("Diagrama aberto em nova guia.", "ok");
    }
  } catch (error) {
    setStatus(error?.message || String(error), "error");
  }
}

function exitOutputToEditor() {
  if (views.output.hidden || lastOutputCode == null) return false;
  if (document.querySelector("dialog[open]")) return false;
  if (document.fullscreenElement) return false;
  const title = els.outputTitle?.hidden ? "" : els.outputTitle?.textContent || "";
  void goToEditor(lastOutputCode, title);
  return true;
}

async function goToEditor(code, title = "") {
  try {
    sessionStorage.setItem(DRAFT_KEY, code);
    if (title) sessionStorage.setItem(TITLE_KEY, title);
  } catch {
    // ignore
  }
  const params = new URLSearchParams(window.location.search);
  previewZoomEnabled = zoomModeEnabled;
  previewZoomView = zoomView;
  shareShowMmd = sourceExpanded;
  shareOnlyDiagram = onlyDiagram;
  d3ForceEnabled = parseD3Param(params);
  shareD3Force = d3ForceEnabled;
  const d3ConfigParam = params.get(D3_CONFIG_PARAM);
  if (d3ConfigParam) {
    d3Config = await decompressD3Config(d3ConfigParam);
  }
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  window.history.pushState({}, "", url.pathname + url.search);
  document.title = "Mermaid Share";
  showView("input");
  await bootInput(code, title);
}

function applyOutputTitle(title) {
  const clean = String(title || "").trim();
  if (!els.outputTitle) return;
  if (clean) {
    els.outputTitle.textContent = clean;
    els.outputTitle.hidden = false;
    document.title = `${clean} · Mermaid Share`;
  } else {
    els.outputTitle.textContent = "";
    els.outputTitle.hidden = true;
    document.title = "Mermaid Share";
  }
}

async function enterFullscreen() {
  const target = els.fullscreenTarget;
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    if (target.requestFullscreen) {
      await target.requestFullscreen();
    } else {
      setStatus("Fullscreen não suportado neste navegador.", "warn");
    }
  } catch (error) {
    setStatus(error?.message || String(error), "error");
  }
}

function remeasureOutputFrame() {
  if (!lastOutputCode || views.output.hidden) return;
  const requestId = ++requestSeq;
  pending.set(requestId, {
    resolve: () => {},
    reject: () => {},
    iframe: els.outputFrame,
    timer: window.setTimeout(() => pending.delete(requestId), 5000),
    expand: zoomModeEnabled,
    kind: "render",
  });
  try {
    postToRenderer(els.outputFrame, { type: "remeasure", requestId });
  } catch {
    pending.delete(requestId);
  }
}

function refreshPreviewOnResize() {
  if (views.input.hidden || lastPreviewCode === null) return;
  if (!String(lastPreviewCode).trim()) return;
  if (isPreviewD3Active(lastPreviewCode)) {
    refreshD3Layout();
    return;
  }
  if (previewZoomEnabled) {
    try {
      if (previewZoomView) {
        postToRenderer(els.previewFrame, {
          type: "set-view",
          view: previewZoomView,
        });
      } else {
        postToRenderer(els.previewFrame, { type: "fit-view" });
      }
    } catch {
      void renderPreview(getEditorValue());
    }
    return;
  }
  void renderPreview(getEditorValue());
}

let previewLayoutObserver = null;

function bindPreviewLayoutObserver() {
  const wrap = els.previewFrame?.parentElement;
  if (!wrap) return;
  previewLayoutObserver?.disconnect();
  previewLayoutObserver = new ResizeObserver(() => {
    if (views.input.hidden || !isPreviewD3Active()) return;
    refreshD3Layout();
  });
  previewLayoutObserver.observe(wrap);
}

function refreshD3Layout() {
  for (const iframe of [els.previewFrame, els.outputFrame]) {
    if (!iframe?.contentWindow) continue;
    try {
      postToRenderer(iframe, { type: "fit-view" });
    } catch {
      /* iframe indisponível */
    }
  }
}

function scheduleLayoutRefresh() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const d3LayoutActive =
      document.body.dataset.d3Output === "on" ||
      (document.body.dataset.d3Force === "on" && !views.input.hidden);

    if (!views.output.hidden) {
      applyOutputHeight(lastOutputContentHeight);
    }

    if (d3LayoutActive) {
      refreshD3Layout();
      return;
    }

    if (!views.output.hidden) {
      if (zoomModeEnabled) {
        requestOutputView();
      } else {
        remeasureOutputFrame();
      }
      return;
    }
    refreshPreviewOnResize();
  }, 150);
}

function showOutputSource(code) {
  if (!els.outputSource || !els.outputSourceCode) return;
  const next = code ?? "";
  els.outputSourceCode.value = next;
  // Mantém o texto no HTML serializado (export / “salvar página”).
  els.outputSourceCode.textContent = next;
  els.outputSource.hidden = onlyDiagram;
  syncSourceExpandedUi();
}

function hideOutputSource() {
  if (!els.outputSource || !els.outputSourceCode) return;
  els.outputSource.hidden = true;
  els.outputSourceCode.value = "";
  els.outputSourceCode.textContent = "";
  if (sourceViewer) {
    sourceViewer.destroy();
    sourceViewer = null;
  }
}

function setSourceExpanded(expanded) {
  sourceExpanded = Boolean(expanded);
  syncSourceExpandedUi();
  syncMmdQueryParam();
}

function toggleSourceExpanded() {
  setSourceExpanded(!sourceExpanded);
}

async function copyOutputSource() {
  const code = lastOutputCode || els.outputSourceCode?.value || "";
  if (!code.trim()) {
    setStatus("Nenhum código para copiar.", "warn");
    return;
  }
  try {
    await navigator.clipboard.writeText(code);
    setStatus("Código Mermaid copiado.", "ok");
    if (els.btnCopySource) {
      els.btnCopySource.classList.add("is-copied");
      setButtonLabel(els.btnCopySource, "Copiado");
      window.setTimeout(() => {
        if (!els.btnCopySource) return;
        els.btnCopySource.classList.remove("is-copied");
        setButtonLabel(els.btnCopySource, "Copiar código");
      }, 1500);
    }
  } catch (error) {
    setStatus(error?.message || String(error), "error");
  }
}

async function bootOutput(param, title = "", outputOptions = {}) {
  const useD3 =
    outputOptions.useD3 != null
      ? Boolean(outputOptions.useD3)
      : parseD3Param(new URLSearchParams(window.location.search));
  const outputD3Config =
    outputOptions.d3Config != null
      ? normalizeD3Config(outputOptions.d3Config)
      : outputOptions.d3ConfigParam
        ? await decompressD3Config(outputOptions.d3ConfigParam)
        : await decompressD3Config(
            new URLSearchParams(window.location.search).get(D3_CONFIG_PARAM) ||
              "",
          );
  d3ForceEnabled = useD3;
  d3Config = outputD3Config;
  showView("output");
  syncZoomModeUi();
  syncZoomQueryParam();
  syncSourceExpandedUi();
  syncMmdQueryParam();
  syncOnlyQueryParam();
  applyOnlyDiagramUi();
  applyOutputHeight(lastOutputContentHeight);
  setStatus("Carregando diagrama…", "muted");
  els.outputError.hidden = true;
  els.outputError.textContent = "";
  hideOutputSource();
  applyOutputTitle(title);

  try {
    const code = await decompressFromParam(param);
    lastOutputCode = code;
    const d3Compatible = useD3 && isD3CompatibleDiagram(code);
    syncD3OutputLayout(d3Compatible);
    if (d3Compatible) {
      zoomModeEnabled = true;
      syncZoomModeUi();
      syncZoomQueryParam();
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    await renderInFrame(els.outputFrame, code, {
      expand: d3Compatible || zoomModeEnabled,
      view: zoomView,
      theme: diagramTheme,
      useD3: d3Compatible,
      d3Config: outputD3Config,
    });
    showOutputSource(code);
    setStatus("", "muted");

    els.btnEdit.onclick = () => {
      void goToEditor(code, title);
    };
    els.btnOpenOutput.onclick = () => {
      window.open(window.location.href, "_blank", "noopener,noreferrer");
    };
    els.btnFullscreen.onclick = () => {
      void enterFullscreen();
    };
    if (els.btnZoomMode) {
      els.btnZoomMode.onclick = () => {
        toggleZoomMode();
      };
    }
    if (els.btnToggleSource) {
      els.btnToggleSource.onclick = () => {
        toggleSourceExpanded();
      };
    }
    if (els.btnCopySource) {
      els.btnCopySource.onclick = () => {
        void copyOutputSource();
      };
    }
    if (els.btnExportOutputPng) {
      els.btnExportOutputPng.onclick = () => {
        void exportOutputPng();
      };
    }
    if (els.btnExportOutputMmd) {
      els.btnExportOutputMmd.onclick = () => {
        exportOutputMmd();
      };
    }
    if (els.btnRawSource) {
      els.btnRawSource.onclick = () => {
        openRawSource();
      };
    }
    if (els.btnExportOutputExcalidraw) {
      els.btnExportOutputExcalidraw.onclick = () => {
        void exportOutputExcalidraw();
      };
    }
  } catch (error) {
    lastOutputCode = null;
    hideOutputSource();
    showRenderError(
      els.outputError,
      error?.message || "Não foi possível decodificar/renderizar o parâmetro d.",
      () =>
        bootOutput(param, title, {
          useD3,
          d3Config: outputD3Config,
        }),
    );
    setStatus("Falha ao carregar diagrama.", "error");
  }
}

function onThemeChanged() {
  diagramTheme = normalizeTheme(els.selTheme?.value);
  syncThemeSelect();
  invalidateUrlPreview();
  if (isAutoEnabled() && editorHasCode()) {
    clearTimeout(autoTimer);
    autoTimer = setTimeout(() => {
      if (!isAutoEnabled()) return;
      void renderPreview(getEditorValue());
      void refreshUrlPreview({ quiet: true });
    }, AUTO_DEBOUNCE_MIN_MS);
    return;
  }
  if (editorHasCode()) {
    void renderPreview(getEditorValue());
  }
}

async function bootInput(initialCode, initialTitle) {
  showView("input");
  document.title = "Mermaid Share";
  document.body.dataset.zoom = "off";

  const draft = initialCode ?? sessionStorage.getItem(DRAFT_KEY) ?? "";
  restoreAutoPreference();
  restoreTitle(initialTitle);
  syncThemeSelect();
  syncEditorShareControls();
  if (!d3ConfigUi && els.d3ConfigDialog) {
    d3ConfigUi = bindD3ConfigDialog(els.d3ConfigDialog, onD3ConfigApplied);
  }
  d3ConfigUi?.setConfig(d3Config);

  if (!editor) {
    editor = createMermaidEditor({
      parent: els.editorHost,
      doc: draft,
      onChange: () => {
        onEditorContentChanged();
      },
      parse: async (code) => {
        try {
          return await parseInPreview(code);
        } catch (error) {
          return { ok: false, error: error?.message || String(error) };
        }
      },
    });
  } else if (initialCode != null) {
    editor.setValue(initialCode);
  } else if (draft && !getEditorValue()) {
    editor.setValue(draft);
  }

  if (!inputBound) {
    inputBound = true;
    bindPreviewLayoutObserver();

    els.titleInput?.addEventListener("input", () => {
      onTitleChanged();
    });

    els.selTheme?.addEventListener("change", () => {
      onThemeChanged();
    });

    els.chkZoomPreview?.addEventListener("change", () => {
      onPreviewZoomChanged();
    });

    els.chkShowMmd?.addEventListener("change", () => {
      onShowMmdChanged();
    });

    els.chkDiagramOnly?.addEventListener("change", () => {
      onDiagramOnlyChanged();
    });

    els.chkD3Force?.addEventListener("change", () => {
      onD3ForceChanged();
    });

    els.btnD3Config?.addEventListener("click", () => {
      els.previewSettingsDialog?.close();
      d3ConfigUi?.open(d3Config);
    });

    els.btnD3GraphConfig?.addEventListener("click", () => {
      d3ConfigUi?.open(d3Config);
    });

    els.chkAuto?.addEventListener("change", () => {
      persistAutoPreference();
      updatePreviewMode();
      if (isAutoEnabled()) {
        scheduleAutoUpdate();
      } else {
        clearTimeout(autoTimer);
        invalidateUrlPreview();
        updatePreviewMode();
      }
    });

    els.btnGenerateUrl?.addEventListener("click", () => {
      void refreshUrlPreview();
    });
    els.btnCopyUrl.addEventListener("click", () => {
      void copyShareUrl();
    });
    els.btnOpenInput.addEventListener("click", () => {
      void openShareInNewTab();
    });
    els.btnRenderPreview?.addEventListener("click", () => {
      clearTimeout(autoTimer);
      void renderPreview(getEditorValue());
    });
    els.btnStripComments?.addEventListener("click", () => {
      applyEditorTransform(removeComments, "Comentários removidos");
    });
    els.btnFormat?.addEventListener("click", () => {
      applyEditorTransform(formatMermaid, "Código formatado");
    });
    els.btnMinify?.addEventListener("click", () => {
      applyEditorTransform(minifyMermaid, "Código minificado");
    });
    els.btnExportPreviewPng?.addEventListener("click", () => {
      void exportPreviewPng();
    });
    els.btnExportPreviewMmd?.addEventListener("click", () => {
      exportPreviewMmd();
    });
    els.btnExportPreviewExcalidraw?.addEventListener("click", () => {
      void exportPreviewExcalidraw();
    });
  }

  setStatus("Modo edição.", "muted");
  onEditorContentChanged({ fromBoot: true });
  editor.focus();
}

function parseRawParam(params = new URLSearchParams(window.location.search)) {
  const raw = params.get(RAW_PARAM);
  if (raw == null || raw === "") return false;
  const value = String(raw).trim().toLowerCase();
  return value === "1" || value === "true" || value === "on" || value === "yes";
}

async function renderRawView(param) {
  let text;
  try {
    text = await decompressFromParam(param);
  } catch (error) {
    text = error?.message || String(error);
  }
  try {
    document.open("text/plain", "replace");
  } catch {
    document.open();
  }
  document.write(text ?? "");
  document.close();
}

async function boot() {
  const params = new URLSearchParams(window.location.search);
  const diagramParam = params.get("d");
  const titleParam = params.get("t") || "";

  if (diagramParam && parseRawParam(params)) {
    await renderRawView(diagramParam);
    return;
  }

  zoomModeEnabled = parseZoomParam(params);
  zoomView = parseZoomView(params);
  diagramTheme = parseThemeParam(params);
  sourceExpanded = parseMmdParam(params);
  onlyDiagram = parseOnlyParam(params);
  const outputUseD3 = parseD3Param(params);
  const outputD3ConfigParam = params.get(D3_CONFIG_PARAM) || "";
  if (diagramParam && outputUseD3 && !params.has(ZOOM_PARAM)) {
    zoomModeEnabled = true;
  }

  if (diagramParam) {
    await bootOutput(diagramParam, titleParam, {
      useD3: outputUseD3,
      d3ConfigParam: outputD3ConfigParam,
    });
  } else {
    await bootInput();
  }
}

function bindHelpDialog() {
  if (!els.btnHelp || !els.helpDialog) return;
  els.btnHelp.addEventListener("click", () => {
    if (typeof els.helpDialog.showModal === "function") {
      els.helpDialog.showModal();
    }
  });
  els.helpDialog.addEventListener("click", (event) => {
    if (event.target === els.helpDialog) {
      els.helpDialog.close();
    }
  });
}

window.addEventListener("message", onRendererMessage);
window.addEventListener("popstate", () => {
  void boot();
});
window.addEventListener("resize", () => {
  scheduleLayoutRefresh();
});
document.addEventListener("fullscreenchange", () => {
  scheduleLayoutRefresh();
});

bindHelpDialog();
bindPreviewToolbar();
void boot();
