import {
  JSON_VIEW_MODE_BEAUTIFY,
  JSON_VIEW_MODE_TREE,
  normalizeJsonViewMode,
} from "./json-view-mode.js";

/**
 * @param {unknown} raw
 * @returns {{ ok: true, value: unknown, empty?: boolean } | { ok: false, error: string }}
 */
export function parseJsonDocument(raw) {
  const text = String(raw ?? "").replace(/^\uFEFF/u, "").trim();
  if (!text) {
    return { ok: true, value: null, empty: true };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

/**
 * @param {string} path
 * @param {string | number} key
 * @returns {string}
 */
export function buildChildJsonPath(path, key) {
  if (path === "$" && (key === "" || key === "root")) return "$";
  if (typeof key === "number" || /^\d+$/u.test(String(key))) {
    return `${path}[${key}]`;
  }
  const segment = String(key).replace(/~/gu, "~0").replace(/\//gu, "~1");
  if (/^[A-Za-z_$][\w$]*$/u.test(segment)) {
    return `${path}.${segment}`;
  }
  return `${path}['${String(key).replace(/'/gu, "\\'")}']`;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function serializeCopyValue(value) {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value === null) return "null";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function valueType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function collectionPreview(value) {
  if (Array.isArray(value)) {
    return `[${value.length} ${value.length === 1 ? "item" : "items"}]`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    return `{${keys.length} ${keys.length === 1 ? "key" : "keys"}}`;
  }
  return "";
}

function isHexColorString(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/iu.test(value);
}

let copyMenuEl = null;

function closeCopyMenu() {
  if (copyMenuEl) {
    copyMenuEl.remove();
    copyMenuEl = null;
  }
}

function copyText(text) {
  const value = String(text ?? "");
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(value);
  }
  const ta = document.createElement("textarea");
  ta.value = value;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  ta.remove();
  return Promise.resolve();
}

/**
 * @param {HTMLElement} anchor
 * @param {{ key: string, path: string, value: unknown, fullJson?: string }} ctx
 */
function openCopyMenu(anchor, ctx) {
  closeCopyMenu();
  const menu = document.createElement("div");
  menu.className = "json-copy-menu";
  menu.setAttribute("role", "menu");

  const items = [
    { label: "Copiar valor", action: () => copyText(serializeCopyValue(ctx.value)) },
    { label: "Copiar key", action: () => copyText(ctx.key || "(raiz)") },
    { label: "Copiar JSONPath", action: () => copyText(ctx.path) },
  ];
  if (ctx.fullJson) {
    items.push({
      label: "Copiar JSON completo",
      action: () => copyText(ctx.fullJson),
    });
  }

  for (const item of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = item.label;
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      void item.action().finally(() => closeCopyMenu());
    });
    menu.appendChild(btn);
  }

  document.body.appendChild(menu);
  copyMenuEl = menu;

  const rect = anchor.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  let left = rect.left;
  let top = rect.bottom + 4;
  if (left + menuRect.width > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - menuRect.width - 8);
  }
  if (top + menuRect.height > window.innerHeight - 8) {
    top = Math.max(8, rect.top - menuRect.height - 4);
  }
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.style.zIndex = "200000";

  const onDoc = (event) => {
    if (menu.contains(event.target) || anchor.contains(event.target)) return;
    closeCopyMenu();
    document.removeEventListener("click", onDoc, true);
    document.removeEventListener("keydown", onEsc, true);
  };
  const onEsc = (event) => {
    if (event.key !== "Escape") return;
    closeCopyMenu();
    document.removeEventListener("click", onDoc, true);
    document.removeEventListener("keydown", onEsc, true);
  };
  window.setTimeout(() => {
    document.addEventListener("click", onDoc, true);
    document.addEventListener("keydown", onEsc, true);
  }, 0);
}

function attachCopyTrigger(lineEl, ctx) {
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "json-copy-trigger";
  trigger.textContent = "Copiar";
  trigger.title = "Copiar valor, key ou JSONPath";
  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    openCopyMenu(trigger, ctx);
  });
  lineEl.appendChild(trigger);
}

function renderPrimitiveValue(parent, value) {
  const span = document.createElement("span");
  const type = valueType(value);
  if (type === "string") {
    span.className = "json-value-string";
    span.textContent = `"${value}"`;
    if (isHexColorString(value)) {
      const swatch = document.createElement("span");
      swatch.className = "json-color-swatch";
      swatch.style.background = value;
      swatch.title = value;
      span.appendChild(swatch);
    }
  } else if (type === "number") {
    span.className = "json-value-number";
    span.textContent = String(value);
  } else if (type === "boolean") {
    span.className = "json-value-bool";
    span.textContent = value ? "true" : "false";
  } else {
    span.className = "json-value-null";
    span.textContent = "null";
  }
  parent.appendChild(span);
}

/**
 * @param {HTMLElement} parent
 * @param {unknown} value
 * @param {string} path
 * @param {string} keyLabel
 * @param {string} fullJson
 * @param {number} depth
 */
function renderBeautifyNode(parent, value, path, keyLabel, fullJson, depth = 0) {
  const type = valueType(value);
  const isCollection = type === "object" || type === "array";

  const block = document.createElement("div");
  block.className = "json-node";

  const line = document.createElement("div");
  line.className = "json-line";

  const ctx = {
    key: keyLabel,
    path,
    value,
    fullJson,
  };

  if (isCollection && value !== null) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "json-toggle";
    toggle.textContent = "−";
    toggle.setAttribute("aria-expanded", "true");
    const children = document.createElement("div");
    children.className = "json-children";

    toggle.addEventListener("click", () => {
      const open = children.hidden;
      children.hidden = !open;
      toggle.textContent = open ? "−" : "+";
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    if (keyLabel) {
      const keySpan = document.createElement("span");
      if (type === "array" && /^\[\d+\]$/u.test(keyLabel)) {
        keySpan.className = "json-index";
      } else {
        keySpan.className = "json-key";
      }
      keySpan.textContent = keyLabel;
      line.appendChild(toggle);
      line.appendChild(keySpan);
      const colon = document.createElement("span");
      colon.className = "json-colon";
      colon.textContent = ": ";
      line.appendChild(colon);
    } else {
      line.appendChild(toggle);
    }

    const preview = document.createElement("span");
    preview.className = "json-value-preview";
    preview.textContent = collectionPreview(value);
    line.appendChild(preview);
    attachCopyTrigger(line, ctx);

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        renderBeautifyNode(
          children,
          item,
          buildChildJsonPath(path, index),
          `[${index}]`,
          fullJson,
          depth + 1,
        );
      });
    } else {
      for (const [key, child] of Object.entries(value)) {
        renderBeautifyNode(
          children,
          child,
          buildChildJsonPath(path, key),
          key,
          fullJson,
          depth + 1,
        );
      }
    }

    block.appendChild(line);
    block.appendChild(children);
  } else {
    const spacer = document.createElement("span");
    spacer.className = "json-toggle-spacer";
    line.appendChild(spacer);
    if (keyLabel) {
      const keySpan = document.createElement("span");
      if (/^\[\d+\]$/u.test(keyLabel)) {
        keySpan.className = "json-index";
      } else {
        keySpan.className = "json-key";
      }
      keySpan.textContent = keyLabel;
      line.appendChild(keySpan);
      const colon = document.createElement("span");
      colon.className = "json-colon";
      colon.textContent = ": ";
      line.appendChild(colon);
    }
    renderPrimitiveValue(line, value);
    attachCopyTrigger(line, ctx);
    block.appendChild(line);
  }

  parent.appendChild(block);
}

function renderBeautifyToolbar(root, value, fullJson) {
  const toolbar = document.createElement("div");
  toolbar.className = "json-view-toolbar";

  const copyAll = document.createElement("button");
  copyAll.type = "button";
  copyAll.className = "json-btn";
  copyAll.textContent = "Copiar JSON completo";
  copyAll.addEventListener("click", () => {
    void copyText(fullJson);
  });
  toolbar.appendChild(copyAll);

  const expandAll = document.createElement("button");
  expandAll.type = "button";
  expandAll.className = "json-btn";
  expandAll.textContent = "Expandir tudo";
  expandAll.addEventListener("click", () => {
    root.querySelectorAll(".json-children").forEach((el) => {
      el.hidden = false;
    });
    root.querySelectorAll(".json-toggle").forEach((btn) => {
      btn.textContent = "−";
      btn.setAttribute("aria-expanded", "true");
    });
  });
  toolbar.appendChild(expandAll);

  const collapseAll = document.createElement("button");
  collapseAll.type = "button";
  collapseAll.className = "json-btn";
  collapseAll.textContent = "Recolher tudo";
  collapseAll.addEventListener("click", () => {
    root.querySelectorAll(".json-children").forEach((el) => {
      el.hidden = true;
    });
    root.querySelectorAll(".json-toggle").forEach((btn) => {
      btn.textContent = "+";
      btn.setAttribute("aria-expanded", "false");
    });
  });
  toolbar.appendChild(collapseAll);

  return toolbar;
}

function mountBeautifyView(container, value, fullJson) {
  const wrap = document.createElement("div");
  wrap.className = "json-view";
  wrap.appendChild(renderBeautifyToolbar(wrap, value, fullJson));
  const body = document.createElement("div");
  body.className = "json-beautify-root";
  renderBeautifyNode(body, value, "$", "", fullJson);
  wrap.appendChild(body);
  container.replaceChildren(wrap);
}

const TREE_NODE_WIDTH = 248;
const TREE_LINE_HEIGHT = 21;
const TREE_CARD_PAD = 10;
const TREE_HEADER_HEIGHT = 26;

function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\/\S+/iu.test(value);
}

/**
 * Árvore composta: primitivos no mesmo card; objetos/arrays aninhados viram filhos.
 * @param {unknown} value
 * @param {string} key
 * @param {string} path
 */
function buildCompoundNode(value, key = "", path = "$") {
  const type = valueType(value);

  if (type === "array") {
    return {
      key,
      path,
      value,
      role: "array",
      inlineLines: [],
      children: value.map((item, index) =>
        buildCompoundNode(
          item,
          `[${index}]`,
          buildChildJsonPath(path, index),
        ),
      ),
    };
  }

  if (type === "object" && value !== null) {
    const inlineLines = [];
    const children = [];
    for (const [childKey, childVal] of Object.entries(value)) {
      const childPath = buildChildJsonPath(path, childKey);
      const childType = valueType(childVal);
      if (childType === "object" || childType === "array") {
        children.push(buildCompoundNode(childVal, childKey, childPath));
        inlineLines.push({
          key: childKey,
          value: childVal,
          path: childPath,
          valueType: childType,
          summary: true,
        });
      } else {
        inlineLines.push({
          key: childKey,
          value: childVal,
          path: childPath,
          valueType: childType,
          summary: false,
        });
      }
    }
    return { key, path, value, role: "object", inlineLines, children };
  }

  return {
    key,
    path,
    value,
    role: type,
    inlineLines: [
      {
        key,
        value,
        path,
        valueType: type,
        summary: false,
      },
    ],
    children: [],
  };
}

function estimateCardHeight(data) {
  const hasHeader =
    data.role === "array" ||
    (data.role === "object" && data.key && !/^\[\d+\]$/u.test(data.key));
  const header = hasHeader ? TREE_HEADER_HEIGHT : 0;
  const lines = data.inlineLines?.length ?? 0;
  const lineCount = Math.max(lines, data.role === "leaf" ? 1 : 0);
  return header + lineCount * TREE_LINE_HEIGHT + TREE_CARD_PAD * 2;
}

function formatInlineSummary(line) {
  if (!line.summary) return "";
  const prefix = line.key ? `${line.key}: ` : "";
  return `${prefix}${collectionPreview(line.value)}`;
}

function createInlineRow(line, fullJson) {
  const row = document.createElement("div");
  row.className = `json-tree-row json-tree-row--${line.valueType}`;

  if (line.summary) {
    const branchKey = formatBranchKey(line.key);
    if (branchKey) {
      row.dataset.branchKey = branchKey;
      row.style.setProperty("--branch-color", linkColorForKey(branchKey));
    }
    const keyEl = document.createElement("span");
    keyEl.className = "json-tree-row-key";
    keyEl.textContent = formatInlineSummary(line);
    row.appendChild(keyEl);
    if (branchKey) {
      const pill = document.createElement("span");
      pill.className = "json-tree-branch-pill";
      pill.textContent = `→ ${branchKey}`;
      row.appendChild(pill);
    }
    row.classList.add("json-tree-row--summary");
    row.addEventListener("click", (event) => {
      event.stopPropagation();
      openJsonTreeModal({
        key: line.key,
        path: line.path,
        value: line.value,
        fullJson,
      });
    });
    return row;
  }

  if (line.key) {
    const keyEl = document.createElement("span");
    keyEl.className = "json-tree-row-key";
    keyEl.textContent = `${line.key}: `;
    row.appendChild(keyEl);
  }

  const valWrap = document.createElement("span");
  valWrap.className = `json-tree-row-val json-tree-row-val--${line.valueType}`;

  if (line.valueType === "string") {
    if (isHttpUrl(line.value)) {
      const link = document.createElement("a");
      link.href = line.value;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = "json-tree-link";
      link.textContent = line.value;
      link.addEventListener("click", (event) => event.stopPropagation());
      valWrap.appendChild(link);
    } else {
      const text = document.createElement("span");
      text.textContent = `"${line.value}"`;
      valWrap.appendChild(text);
      if (isHexColorString(line.value)) {
        const swatch = document.createElement("span");
        swatch.className = "json-tree-swatch";
        swatch.style.background = line.value;
        swatch.title = line.value;
        valWrap.appendChild(swatch);
      }
    }
  } else if (line.valueType === "number") {
    valWrap.textContent = String(line.value);
  } else if (line.valueType === "boolean") {
    valWrap.textContent = line.value ? "true" : "false";
  } else if (line.valueType === "null") {
    valWrap.textContent = "null";
  } else {
    valWrap.textContent = serializeCopyValue(line.value);
  }

  row.appendChild(valWrap);
  return row;
}

function buildModalBeautifyBody(bodyEl, nodeValue, path, fullJson) {
  bodyEl.replaceChildren();
  const inner = document.createElement("div");
  inner.className = "json-beautify-root";
  const type = valueType(nodeValue);
  if (type === "object" || type === "array") {
    renderBeautifyNode(inner, nodeValue, path, "", fullJson);
  } else {
    const line = document.createElement("div");
    line.className = "json-line";
    renderPrimitiveValue(line, nodeValue);
    attachCopyTrigger(line, {
      key: "",
      path,
      value: nodeValue,
      fullJson,
    });
    inner.appendChild(line);
  }
  bodyEl.appendChild(inner);
}

let jsonTreeModalEl = null;
let jsonTreeModalPathEl = null;
let jsonTreeModalBodyEl = null;
let jsonTreeModalCopyBtn = null;

const TREE_H_GAP = 76;
const TREE_V_GAP = 14;

function ensureJsonTreeModal() {
  if (jsonTreeModalEl) return jsonTreeModalEl;

  const dialog = document.createElement("dialog");
  dialog.className = "json-tree-modal";

  const inner = document.createElement("div");
  inner.className = "json-tree-modal-inner";

  const header = document.createElement("header");
  header.className = "json-tree-modal-header";

  const titleWrap = document.createElement("div");
  titleWrap.className = "json-tree-modal-title-wrap";
  const label = document.createElement("span");
  label.className = "json-tree-modal-label";
  label.textContent = "JSONPath";
  jsonTreeModalPathEl = document.createElement("strong");
  jsonTreeModalPathEl.className = "json-tree-modal-path";
  titleWrap.append(label, jsonTreeModalPathEl);

  const actions = document.createElement("div");
  actions.className = "json-tree-modal-actions";

  jsonTreeModalCopyBtn = document.createElement("button");
  jsonTreeModalCopyBtn.type = "button";
  jsonTreeModalCopyBtn.className = "json-tree-modal-btn";
  jsonTreeModalCopyBtn.textContent = "Opções de cópia";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "json-tree-modal-btn json-tree-modal-btn--primary";
  closeBtn.textContent = "Fechar";
  closeBtn.addEventListener("click", () => {
    closeCopyMenu();
    dialog.close();
  });

  actions.append(jsonTreeModalCopyBtn, closeBtn);
  header.append(titleWrap, actions);

  jsonTreeModalBodyEl = document.createElement("div");
  jsonTreeModalBodyEl.className = "json-tree-modal-body";

  inner.append(header, jsonTreeModalBodyEl);
  dialog.append(inner);

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      closeCopyMenu();
      dialog.close();
    }
  });
  dialog.addEventListener("close", () => {
    closeCopyMenu();
  });

  document.body.appendChild(dialog);
  jsonTreeModalEl = dialog;
  return dialog;
}

function openJsonTreeModal({ key, path, value, fullJson }) {
  const dialog = ensureJsonTreeModal();
  const safePath = path || "$";
  if (jsonTreeModalPathEl) jsonTreeModalPathEl.textContent = safePath;
  if (jsonTreeModalBodyEl) {
    buildModalBeautifyBody(jsonTreeModalBodyEl, value, safePath, fullJson);
  }
  if (jsonTreeModalCopyBtn) {
    const ctx = { key: key || "", path: safePath, value, fullJson };
    jsonTreeModalCopyBtn.onclick = (event) => {
      event.stopPropagation();
      openCopyMenu(jsonTreeModalCopyBtn, ctx);
    };
  }
  if (typeof dialog.showModal !== "function") return;
  if (dialog.open) dialog.close();
  dialog.showModal();
}

/**
 * Layout horizontal: posX = coluna, posY = centro vertical do card.
 * @returns {number} y exclusivo após o subárvore
 */
function layoutTreeNode(node, depth, topY) {
  const cardH = estimateCardHeight(node.data);
  const posX = depth * (TREE_NODE_WIDTH + TREE_H_GAP);

  if (!node.children || node.children.length === 0) {
    const posY = topY + cardH / 2;
    node.posX = posX;
    node.posY = posY;
    node.cardH = cardH;
    return topY + cardH;
  }

  let cursorY = topY;
  for (const child of node.children) {
    cursorY = layoutTreeNode(child, depth + 1, cursorY) + TREE_V_GAP;
  }
  const blockBottom = cursorY - TREE_V_GAP;
  const firstChild = node.children[0];
  const lastChild = node.children[node.children.length - 1];
  node.posX = posX;
  node.posY = (firstChild.posY + lastChild.posY) / 2;
  node.cardH = cardH;
  return Math.max(blockBottom, topY + cardH);
}

const TREE_LINK_COLORS = [
  "#5ec8e8",
  "#f4a261",
  "#79c0ff",
  "#c792ea",
  "#7ddea8",
  "#e9c46a",
];

function linkColorForKey(key) {
  const text = String(key || "");
  if (!text) return "#6b7a94";
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return TREE_LINK_COLORS[hash % TREE_LINK_COLORS.length];
}

/**
 * Conector na altura do filho + perna vertical no pai (evita “fan” confuso).
 * @returns {{ d: string, labelX: number, labelY: number }}
 */
function treeLinkGeometry(source, target) {
  const x1 = source.posX + TREE_NODE_WIDTH / 2;
  const x2 = target.posX - TREE_NODE_WIDTH / 2;
  const yChild = target.posY;
  const busX = x1 + 18;
  const parentHalf = (source.cardH ?? estimateCardHeight(source.data)) / 2;
  const parentTop = source.posY - parentHalf;
  const parentBottom = source.posY + parentHalf;
  const yOnParent = Math.max(parentTop, Math.min(parentBottom, yChild));

  let d;
  if (Math.abs(yOnParent - yChild) < 1.5) {
    d = `M${x1},${yChild} H${x2}`;
  } else {
    d = `M${x1},${yOnParent} H${busX} V${yChild} H${x2}`;
  }

  const labelX = busX + 6;
  const labelY = yChild - 5;
  return { d, labelX, labelY };
}

function formatBranchKey(key) {
  const text = String(key || "");
  if (!text || /^\[\d+\]$/u.test(text)) return "";
  return text;
}

function createTreeCard(data, fullJson) {
  const card = document.createElement("div");
  const role =
    data.role === "object" || data.role === "array" ? data.role : data.role;
  card.className = `json-tree-card json-tree-card--${role}`;
  card.setAttribute("role", "button");
  card.tabIndex = 0;

  const namedKey = data.key && !/^\[\d+\]$/u.test(data.key) ? data.key : "";
  const showHeader =
    data.role === "array" || (data.role === "object" && Boolean(namedKey));

  if (showHeader) {
    const header = document.createElement("div");
    header.className = "json-tree-card-header";
    if (namedKey) {
      const keySpan = document.createElement("span");
      keySpan.className = "json-tree-card-header-key";
      keySpan.textContent = namedKey;
      keySpan.style.color = linkColorForKey(namedKey);
      const meta = document.createElement("span");
      meta.className = "json-tree-card-header-meta";
      meta.textContent = collectionPreview(data.value);
      header.append(keySpan, meta);
    } else {
      header.textContent = collectionPreview(data.value);
    }
    card.appendChild(header);
  }

  const body = document.createElement("div");
  body.className = "json-tree-card-body";
  for (const line of data.inlineLines) {
    body.appendChild(createInlineRow(line, fullJson));
  }
  card.appendChild(body);

  const openSelf = () => {
    openJsonTreeModal({
      key: data.key,
      path: data.path,
      value: data.value,
      fullJson,
    });
  };
  card.addEventListener("click", openSelf);
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openSelf();
    }
  });

  const height = estimateCardHeight(data);
  return { card, width: TREE_NODE_WIDTH, height };
}

async function mountTreeView(container, value, fullJson) {
  const wrap = document.createElement("div");
  wrap.className = "json-view json-tree-layout";

  const toolbar = document.createElement("div");
  toolbar.className = "json-view-toolbar";
  const copyAll = document.createElement("button");
  copyAll.type = "button";
  copyAll.className = "json-btn";
  copyAll.textContent = "Copiar JSON completo";
  copyAll.addEventListener("click", () => {
    void copyText(fullJson);
  });
  toolbar.appendChild(copyAll);
  wrap.appendChild(toolbar);

  const stage = document.createElement("div");
  stage.className = "json-tree-stage";

  const canvasWrap = document.createElement("div");
  canvasWrap.className = "json-tree-canvas-wrap";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  canvasWrap.appendChild(svg);
  stage.appendChild(canvasWrap);
  wrap.appendChild(stage);
  container.replaceChildren(wrap);

  const rootData = buildCompoundNode(value, "", "$");
  const d3 = await import("https://cdn.jsdelivr.net/npm/d3@7/+esm");
  const hierarchy = d3.hierarchy(rootData, (d) => d.children);
  layoutTreeNode(hierarchy, 0, 0);

  const nodes = hierarchy.descendants();
  const links = hierarchy.links();

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    const h = node.cardH ?? estimateCardHeight(node.data);
    minX = Math.min(minX, node.posX - TREE_NODE_WIDTH / 2);
    maxX = Math.max(maxX, node.posX + TREE_NODE_WIDTH / 2);
    minY = Math.min(minY, node.posY - h / 2);
    maxY = Math.max(maxY, node.posY + h / 2);
  }

  const padX = 32;
  const padY = 32;
  const width = Math.max(520, maxX - minX + padX * 2);
  const height = Math.max(300, maxY - minY + padY * 2);

  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute("transform", `translate(${padX - minX},${padY - minY})`);
  svg.appendChild(g);

  const linkGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  linkGroup.setAttribute("class", "json-tree-links");
  g.appendChild(linkGroup);

  for (const link of links) {
    const branchKey = formatBranchKey(link.target.data.key);
    const color = linkColorForKey(branchKey || link.target.data.key);
    const { d, labelX, labelY } = treeLinkGeometry(link.source, link.target);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("stroke", color);
    linkGroup.appendChild(path);

    const anchor = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    anchor.setAttribute("cx", String(link.source.posX + TREE_NODE_WIDTH / 2));
    anchor.setAttribute("cy", String(link.target.posY));
    anchor.setAttribute("r", "4");
    anchor.setAttribute("fill", color);
    anchor.setAttribute("stroke", "#12151c");
    anchor.setAttribute("stroke-width", "1.5");
    linkGroup.appendChild(anchor);

    if (branchKey) {
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("class", "json-tree-link-label");
      label.setAttribute("x", String(labelX));
      label.setAttribute("y", String(labelY));
      label.setAttribute("fill", color);
      label.textContent = branchKey;
      linkGroup.appendChild(label);
    }
  }

  const nodeGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  nodeGroup.setAttribute("class", "json-tree-nodes");
  g.appendChild(nodeGroup);
  const SVG_NS = "http://www.w3.org/2000/svg";

  for (const node of nodes) {
    const { card, width: cardW, height: cardH } = createTreeCard(
      node.data,
      fullJson,
    );
    const group = document.createElementNS(SVG_NS, "g");
    group.classList.add("json-tree-node");
    group.setAttribute("transform", `translate(${node.posX},${node.posY})`);

    const fo = document.createElementNS(SVG_NS, "foreignObject");
    fo.setAttribute("x", String(-cardW / 2));
    fo.setAttribute("y", String(-cardH / 2));
    fo.setAttribute("width", String(cardW));
    fo.setAttribute("height", String(cardH));
    fo.appendChild(card);
    group.appendChild(fo);
    nodeGroup.appendChild(group);
  }
}

/**
 * @param {HTMLElement} container
 * @param {unknown} value
 * @param {{ mode?: string, raw?: string }} [options]
 */
export async function renderJsonToRoot(container, value, options = {}) {
  const mode = normalizeJsonViewMode(options.mode);
  const fullJson =
    options.raw != null
      ? String(options.raw)
      : JSON.stringify(value, null, 2);
  if (mode === JSON_VIEW_MODE_TREE) {
    await mountTreeView(container, value, fullJson);
  } else {
    mountBeautifyView(container, value, fullJson);
  }
}
