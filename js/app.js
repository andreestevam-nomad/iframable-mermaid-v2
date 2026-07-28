import {
  compressToParam,
  decompressFromParam,
  URL_WARN_THRESHOLD,
} from "./compress.js";
import { formatMermaid, minifyMermaid, removeComments } from "./mermaid-text.js";
import { createMermaidEditor } from "./editor.js";
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
const IFRAME_TARGET = "*";
/** Origem canônica das URLs compartilháveis (evita localhost no link). */
const PUBLIC_SHARE_ORIGIN = "https://andreestevam-nomad.github.io";
const PUBLIC_SHARE_PATH = "/iframable-mermaid-v2/";

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
  outputTitle: document.getElementById("output-title"),
  outputFrame: document.getElementById("output-frame"),
  outputError: document.getElementById("output-error"),
  outputSource: document.getElementById("output-source"),
  outputSourceCode: document.getElementById("output-source-code"),
  btnCopySource: document.getElementById("btn-copy-source"),
  btnZoomMode: document.getElementById("btn-zoom-mode"),
  btnFullscreen: document.getElementById("btn-fullscreen"),
  btnEdit: document.getElementById("btn-edit"),
  btnOpenOutput: document.getElementById("btn-open-output"),
  fullscreenTarget: document.getElementById("fullscreen-target"),
  btnHelp: document.getElementById("btn-help"),
  helpDialog: document.getElementById("help-dialog"),
};

/** @type {ReturnType<typeof createMermaidEditor> | null} */
let editor = null;
let persistTimer = null;
let autoTimer = null;
let urlSeq = 0;
let cachedShareUrl = "";
let cachedShareTitle = "";
let urlEpoch = -1;
let urlBusy = false;
let requestSeq = 0;
let inputBound = false;
let editorEpoch = 0;
let previewEpoch = -1;
let lastPreviewCode = null;
let lastOutputCode = null;
let lastOutputContentHeight = 280;
let resizeTimer = null;
/** Modo zoom/pan na view compartilhada (ligado por padrão). */
let zoomModeEnabled = true;

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
}

function setStatus(message, tone = "muted") {
  els.status.textContent = message;
  els.status.dataset.tone = tone;
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

function buildShareUrl(param, title = getDiagramTitle()) {
  const url = getShareBaseUrl();
  url.search = "";
  url.hash = "";
  url.searchParams.set("d", param);
  const cleanTitle = String(title || "").trim();
  if (cleanTitle) {
    url.searchParams.set("t", cleanTitle);
  }
  return url.toString();
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
  els.btnZoomMode.setAttribute("aria-pressed", zoomModeEnabled ? "true" : "false");
  els.btnZoomMode.textContent = zoomModeEnabled
    ? "Modo zoom: ligado"
    : "Modo zoom: desligado";
  els.btnZoomMode.classList.toggle("primary", zoomModeEnabled);
}

function applyOutputHeight(contentHeight) {
  if (document.fullscreenElement === els.fullscreenTarget) {
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

function requestOutputFit() {
  if (!zoomModeEnabled) return;
  try {
    postToRenderer(els.outputFrame, { type: "fit-view" });
  } catch {
    /* iframe indisponível */
  }
}

async function setZoomMode(enabled) {
  zoomModeEnabled = Boolean(enabled);
  syncZoomModeUi();
  applyOutputHeight(lastOutputContentHeight);
  try {
    await ensureRenderer(els.outputFrame);
    postToRenderer(els.outputFrame, {
      type: "set-zoom-mode",
      enabled: zoomModeEnabled,
    });
  } catch (error) {
    setStatus(error?.message || String(error), "error");
  }
}

function toggleZoomMode() {
  void setZoomMode(!zoomModeEnabled);
}

async function renderInFrame(iframe, code, { expand = false } = {}) {
  await ensureRenderer(iframe);
  const requestId = ++requestSeq;

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
      postToRenderer(iframe, { type: "render", code, requestId, expand });
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

function onRendererMessage(event) {
  if (!isAllowedRendererOrigin(event.origin)) return;
  if (!isFromRenderer(event)) return;
  const data = event.data;
  if (!data) return;

  if (data.type === "zoom-mode-changed") {
    if (event.source !== els.outputFrame?.contentWindow) return;
    if (typeof data.height === "number") {
      lastOutputContentHeight = Math.max(120, Math.ceil(data.height));
    }
    applyOutputHeight(data.height);
    if (zoomModeEnabled) {
      requestAnimationFrame(() => requestOutputFit());
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

  if (data.type !== "render-result") return;

  const entry = pending.get(data.requestId);
  if (!entry || entry.kind === "parse") return;
  if (event.source !== entry.iframe.contentWindow) return;

  window.clearTimeout(entry.timer);
  pending.delete(data.requestId);

  if (data.skipped) {
    entry.resolve(data);
    return;
  }

  if (entry.iframe === els.outputFrame) {
    if (typeof data.height === "number" && !zoomModeEnabled) {
      lastOutputContentHeight = Math.max(120, Math.ceil(data.height));
    }
    applyOutputHeight(data.height);
    if (zoomModeEnabled) {
      requestAnimationFrame(() => requestOutputFit());
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
    await renderInFrame(els.previewFrame, code);
    lastPreviewCode = code;
    previewEpoch = epochAtStart;
    setPreviewStatus("");
    updatePreviewMode();
  } catch (error) {
    lastPreviewCode = null;
    previewEpoch = -1;
    setPreviewStatus("");
    updatePreviewMode();
    els.previewError.hidden = false;
    els.previewError.textContent = error?.message || String(error);
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
    // Migra preferência antiga de hot-reload, se existir.
    const legacy = sessionStorage.getItem("mermaid-hot-reload");
    const stored = sessionStorage.getItem(AUTO_KEY);
    els.chkAuto.checked =
      stored === "1" || (stored === null && legacy === "1");
  } catch {
    els.chkAuto.checked = false;
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

function setUrlPreview(text, charLabel, tone = "muted") {
  if (els.urlPreviewText) {
    els.urlPreviewText.textContent = text;
  }
  if (els.urlCharCount) {
    els.urlCharCount.textContent = charLabel;
    els.urlCharCount.dataset.tone = tone;
  }
}

function invalidateUrlPreview() {
  urlSeq += 1;
  cachedShareUrl = "";
  cachedShareTitle = "";
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
    const url = buildShareUrl(param, title);
    if (seq !== urlSeq) return;

    cachedShareUrl = url;
    cachedShareTitle = title;
    urlEpoch = epochAtStart;
    const tone = url.length > URL_WARN_THRESHOLD ? "warn" : "ok";
    const label =
      url.length > URL_WARN_THRESHOLD
        ? `${url.length} chars (longa)`
        : `${url.length} chars`;
    setUrlPreview(truncateUrl(url), label, tone);
    if (!quiet) {
      setStatus(`URL gerada (${label}).`, tone === "warn" ? "warn" : "ok");
    }
  } catch (error) {
    if (seq !== urlSeq) return;
    cachedShareUrl = "";
    cachedShareTitle = "";
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
    cachedShareTitle === getDiagramTitle()
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

function goToEditor(code, title = "") {
  try {
    sessionStorage.setItem(DRAFT_KEY, code);
    if (title) sessionStorage.setItem(TITLE_KEY, title);
  } catch {
    // ignore
  }
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  window.history.pushState({}, "", url.pathname + url.search);
  document.title = "Mermaid Share";
  showView("input");
  void bootInput(code, title);
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
  void renderPreview(getEditorValue());
}

function scheduleLayoutRefresh() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!views.output.hidden) {
      applyOutputHeight(lastOutputContentHeight);
      if (zoomModeEnabled) {
        requestOutputFit();
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
  els.outputSourceCode.textContent = code;
  els.outputSource.hidden = false;
}

function hideOutputSource() {
  if (!els.outputSource || !els.outputSourceCode) return;
  els.outputSource.hidden = true;
  els.outputSourceCode.textContent = "";
}

async function copyOutputSource() {
  const code = lastOutputCode || els.outputSourceCode?.textContent || "";
  if (!code.trim()) {
    setStatus("Nenhum código para copiar.", "warn");
    return;
  }
  try {
    await navigator.clipboard.writeText(code);
    setStatus("Código Mermaid copiado.", "ok");
    if (els.btnCopySource) {
      const prev = els.btnCopySource.textContent;
      els.btnCopySource.textContent = "Copiado";
      window.setTimeout(() => {
        if (els.btnCopySource) els.btnCopySource.textContent = prev || "Copiar código";
      }, 1500);
    }
  } catch (error) {
    setStatus(error?.message || String(error), "error");
  }
}

async function bootOutput(param, title = "") {
  showView("output");
  syncZoomModeUi();
  applyOutputHeight(lastOutputContentHeight);
  setStatus("Carregando diagrama…", "muted");
  els.outputError.hidden = true;
  els.outputError.textContent = "";
  hideOutputSource();
  applyOutputTitle(title);

  try {
    const code = await decompressFromParam(param);
    lastOutputCode = code;
    await new Promise((resolve) => setTimeout(resolve, 50));
    await renderInFrame(els.outputFrame, code, { expand: zoomModeEnabled });
    showOutputSource(code);
    setStatus("", "muted");

    els.btnEdit.onclick = () => goToEditor(code, title);
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
    if (els.btnCopySource) {
      els.btnCopySource.onclick = () => {
        void copyOutputSource();
      };
    }
  } catch (error) {
    lastOutputCode = null;
    hideOutputSource();
    els.outputError.hidden = false;
    els.outputError.textContent =
      error?.message || "Não foi possível decodificar/renderizar o parâmetro d.";
    setStatus("Falha ao carregar diagrama.", "error");
  }
}

async function bootInput(initialCode, initialTitle) {
  showView("input");
  document.title = "Mermaid Share";

  const draft = initialCode ?? sessionStorage.getItem(DRAFT_KEY) ?? "";
  restoreAutoPreference();
  restoreTitle(initialTitle);

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

    els.titleInput?.addEventListener("input", () => {
      onTitleChanged();
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
  }

  setStatus("Modo edição.", "muted");
  onEditorContentChanged({ fromBoot: true });
  editor.focus();
}

async function boot() {
  const params = new URLSearchParams(window.location.search);
  const diagramParam = params.get("d");
  const titleParam = params.get("t") || "";

  if (diagramParam) {
    await bootOutput(diagramParam, titleParam);
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
void boot();
