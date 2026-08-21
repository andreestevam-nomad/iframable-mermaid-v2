// Bundled renderer helpers (inlined em renderer.html para GitHub Pages).

function removeComments(source) {
  const lines = String(source || "").split(/\r?\n/u);
  const out = [];
  for (const line of lines) {
    if (line.trimStart().startsWith("%%")) continue;
    let cut = line;
    let inDouble = false;
    let inSingle = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      const prev = i > 0 ? line[i - 1] : "";
      if (ch === '"' && prev !== "\\" && !inSingle) inDouble = !inDouble;
      if (ch === "'" && prev !== "\\" && !inDouble) inSingle = !inSingle;
      if (!inDouble && !inSingle && ch === "%" && line[i + 1] === "%") {
        cut = line.slice(0, i).trimEnd();
        break;
      }
    }
    out.push(cut);
  }
  return out.join("\n").replace(/\n{3,}/gu, "\n\n");
}

const DEFAULT_D3_FORCE = {
  linkDistance: 30,
  linkStrength: 1,
  chargeStrength: -30,
  centerStrength: 1,
  collisionRadius: 0,
  alphaDecay: 0.0228,
  velocityDecay: 0.4,
};

const DEFAULT_D3_CONFIG = {
  physicsEnabled: true,
  showPlayPause: true,
  dragWhenPaused: true,
  animateNodes: false,
  animateSpeed: 300,
  animateConcurrent: 3,
  animateRootRadiusPct: 85,
  animateChildRadiusPct: 50,
  mouseMode: "drag",
  nodeDisplay: "large",
  nodeSidebar: false,
  autoLineWrap: false,
  wrapMaxChars: 28,
  force: { ...DEFAULT_D3_FORCE },
};

const MOUSE_MODES = new Set(["drag", "repulsion"]);
const NODE_DISPLAYS = new Set(["large", "small", "medium"]);

function num(value, fallback, min = -Infinity, max = Infinity) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeD3Config(partial) {
  const input = partial && typeof partial === "object" ? partial : {};
  const forceIn = input.force && typeof input.force === "object" ? input.force : {};
  const base = DEFAULT_D3_CONFIG.force;
  return {
    physicsEnabled:
      input.physicsEnabled != null
        ? Boolean(input.physicsEnabled)
        : DEFAULT_D3_CONFIG.physicsEnabled,
    showPlayPause:
      input.showPlayPause != null
        ? Boolean(input.showPlayPause)
        : DEFAULT_D3_CONFIG.showPlayPause,
    dragWhenPaused:
      input.dragWhenPaused != null
        ? Boolean(input.dragWhenPaused)
        : DEFAULT_D3_CONFIG.dragWhenPaused,
    animateNodes:
      input.animateNodes != null
        ? Boolean(input.animateNodes)
        : DEFAULT_D3_CONFIG.animateNodes,
    animateSpeed: num(input.animateSpeed, DEFAULT_D3_CONFIG.animateSpeed, 50, 2000),
    animateConcurrent: num(
      input.animateConcurrent,
      DEFAULT_D3_CONFIG.animateConcurrent,
      1,
      30,
    ),
    animateRootRadiusPct: num(
      input.animateRootRadiusPct,
      DEFAULT_D3_CONFIG.animateRootRadiusPct,
      2,
      100,
    ),
    animateChildRadiusPct: num(
      input.animateChildRadiusPct,
      DEFAULT_D3_CONFIG.animateChildRadiusPct,
      5,
      100,
    ),
    mouseMode: MOUSE_MODES.has(input.mouseMode)
      ? input.mouseMode
      : DEFAULT_D3_CONFIG.mouseMode,
    nodeDisplay: NODE_DISPLAYS.has(input.nodeDisplay)
      ? input.nodeDisplay
      : DEFAULT_D3_CONFIG.nodeDisplay,
    nodeSidebar:
      input.nodeSidebar != null
        ? Boolean(input.nodeSidebar)
        : DEFAULT_D3_CONFIG.nodeSidebar,
    autoLineWrap:
      input.autoLineWrap != null
        ? Boolean(input.autoLineWrap)
        : DEFAULT_D3_CONFIG.autoLineWrap,
    wrapMaxChars: num(input.wrapMaxChars, DEFAULT_D3_CONFIG.wrapMaxChars, 8, 80),
    force: {
      linkDistance: num(forceIn.linkDistance, base.linkDistance, 1, 500),
      linkStrength: num(forceIn.linkStrength, base.linkStrength, 0, 5),
      chargeStrength: num(forceIn.chargeStrength, base.chargeStrength, -1000, 0),
      centerStrength: num(forceIn.centerStrength, base.centerStrength, 0, 2),
      collisionRadius: num(forceIn.collisionRadius, base.collisionRadius, 0, 200),
      alphaDecay: num(forceIn.alphaDecay, base.alphaDecay, 0.001, 0.2),
      velocityDecay: num(forceIn.velocityDecay, base.velocityDecay, 0.05, 0.99),
    },
  };
}

const FLOWCHART_TYPES = new Set(["flowchart", "graph"]);
const ARROW_RE =
  /(-{1,2}|={1,2}|\.-|-\.|o-|x-|~)(?:-{1,2}|={1,2}|\.-|-\.|o-|x-|~)?>/u;

function stripQuotes(text) {
  const trimmed = String(text || "").trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function decodeLabel(text) {
  return stripQuotes(String(text || ""))
    .replace(/\\n/gu, "\n")
    .replace(/<br\s*\/?>/giu, "\n")
    .trim();
}

function slugId(text, index) {
  const base = String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return base ? `${base}-${index}` : `node-${index}`;
}

function normalizeColor(value) {
  const raw = String(value || "").trim().replace(/;+$/u, "");
  if (!raw) return undefined;
  return raw;
}

function parsePx(value) {
  const n = parseFloat(String(value || "").replace(/px\s*$/iu, ""));
  return Number.isFinite(n) ? n : undefined;
}

function parseStyleProps(styleStr) {
  const out = {};
  for (const part of String(styleStr || "").split(",")) {
    const trimmed = part.trim().replace(/;+$/u, "");
    if (!trimmed) continue;
    const colon = trimmed.indexOf(":");
    if (colon < 0) continue;
    const key = trimmed.slice(0, colon).trim().toLowerCase();
    const value = trimmed.slice(colon + 1).trim();
    if (key === "fill") out.fill = normalizeColor(value);
    else if (key === "stroke") out.stroke = normalizeColor(value);
    else if (key === "stroke-width") out.strokeWidth = parsePx(value);
    else if (key === "color") out.color = normalizeColor(value);
  }
  return out;
}

function parseIdList(raw) {
  return String(raw || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function parseClassDefLine(line) {
  const match = line.match(/^classDef\s+(\S+)\s+(.+?)\s*;?\s*$/iu);
  if (!match) return null;
  return { name: match[1], style: parseStyleProps(match[2]) };
}

function parseClassLine(line) {
  const match = line.match(/^class\s+(.+?)\s+(\S+)\s*;?\s*$/iu);
  if (!match) return null;
  return { ids: parseIdList(match[1]), className: match[2] };
}

function parseStyleLine(line) {
  const match = line.match(/^style\s+(.+)$/iu);
  if (!match) return null;
  const rest = match[1];
  const propMatch = rest.match(/\b(fill|stroke|stroke-width|color)\s*:/iu);
  if (!propMatch || propMatch.index == null) return null;
  const idsPart = rest.slice(0, propMatch.index).trim().replace(/,\s*$/u, "");
  const propsPart = rest.slice(propMatch.index);
  return { ids: parseIdList(idsPart), style: parseStyleProps(propsPart) };
}

function mergeNodeStyle(node, style) {
  if (!node || !style) return;
  if (style.fill) node.fill = style.fill;
  if (style.stroke) node.stroke = style.stroke;
  if (style.strokeWidth != null) node.strokeWidth = style.strokeWidth;
  if (style.color) node.color = style.color;
}

function splitNodeChunk(chunk) {
  const inlineClass = chunk.match(/:::\s*([\w-]+)\s*$/u);
  if (!inlineClass) {
    return { chunk, className: null };
  }
  return {
    chunk: chunk.slice(0, inlineClass.index).trim(),
    className: inlineClass[1],
  };
}

function applyClassName(nodes, classDefs, id, className) {
  if (!className) return;
  const style = classDefs.get(className);
  if (!style) return;
  mergeNodeStyle(nodes.get(id), style);
}

function ensureNode(nodes, id, label, shape, className = null, classDefs = null) {
  const cleanId = String(id || "").trim();
  if (!cleanId) return;
  const existing = nodes.get(cleanId);
  const nextLabel = decodeLabel(label ?? cleanId);
  if (existing) {
    if (nextLabel && (!existing.label || existing.label === existing.id)) {
      existing.label = nextLabel;
    }
    if (shape && !existing.shape) existing.shape = shape;
    if (className && classDefs) applyClassName(nodes, classDefs, cleanId, className);
    return;
  }
  nodes.set(cleanId, {
    id: cleanId,
    label: nextLabel || cleanId,
    shape: shape || "rect",
  });
  if (className && classDefs) {
    applyClassName(nodes, classDefs, cleanId, className);
  }
}

const NODE_DEF_RE =
  /([A-Za-z][\w-]*|\d+)(?:(\[\[([^\]]+)\]\])|(\[\(([^)]+)\)\])|(\(\(([^)]+)\)\))|\(([^)]+)\)|\{([^}]+)\}|\[([^\]]+)\]|>([^\]]+)\])?/gu;

function extractNodeDefs(chunk) {
  const out = [];
  let match;
  NODE_DEF_RE.lastIndex = 0;
  while ((match = NODE_DEF_RE.exec(chunk)) !== null) {
    const id = match[1];
    let label = id;
    let shape = "rect";
    if (match[3] != null) {
      label = match[3];
      shape = "subroutine";
    } else if (match[5] != null) {
      label = match[5];
      shape = "circle";
    } else if (match[7] != null) {
      label = match[7];
      shape = "circle";
    } else if (match[8] != null) {
      label = match[8];
      shape = "rounded";
    } else if (match[9] != null) {
      label = match[9];
      shape = "diamond";
    } else if (match[10] != null) {
      label = match[10];
      shape = "rect";
    } else if (match[11] != null) {
      label = match[11];
      shape = "flag";
    }
    out.push({ id, label, shape });
  }
  return out;
}

function splitLinkLine(line) {
  const arrowMatch = line.match(ARROW_RE);
  if (!arrowMatch || arrowMatch.index == null) return null;
  const idx = arrowMatch.index;
  const arrowLen = arrowMatch[0].length;
  const left = line.slice(0, idx).trim();
  const rest = line.slice(idx + arrowLen).trim();
  const pipe = rest.match(/^\|([^|]*)\|\s*(.*)$/u);
  if (pipe) {
    return { left, label: decodeLabel(pipe[1]), right: pipe[2].trim() };
  }
  return { left, label: "", right: rest };
}

function parseFlowchart(source) {
  const cleaned = removeComments(source);
  const lines = cleaned.split(/\r?\n/u);
  const nodes = new Map();
  const links = [];
  const classDefs = new Map();
  const pendingClasses = [];
  const pendingStyles = [];

  function registerNodesFromChunk(chunk) {
    const { chunk: cleanChunk, className } = splitNodeChunk(chunk);
    for (const def of extractNodeDefs(cleanChunk)) {
      ensureNode(nodes, def.id, def.label, def.shape, className, classDefs);
    }
    return extractNodeDefs(cleanChunk);
  }

  for (const rawLine of lines) {
    const line = rawLine.trim().replace(/;+$/u, "");
    if (!line || line.startsWith("%%")) continue;
    const lower = line.toLowerCase();
    if (FLOWCHART_TYPES.has(lower.split(/\s+/u)[0])) continue;

    const classDef = parseClassDefLine(line);
    if (classDef) {
      classDefs.set(classDef.name, classDef.style);
      continue;
    }

    const classLine = parseClassLine(line);
    if (classLine) {
      pendingClasses.push(classLine);
      continue;
    }

    const styleLine = parseStyleLine(line);
    if (styleLine) {
      pendingStyles.push(styleLine);
      continue;
    }

    if (/^(direction|linkStyle|click|subgraph|end)\b/iu.test(line)) {
      if (/^subgraph\b/iu.test(line)) {
        const sub = line.match(/^subgraph\s+(\S+)(?:\s+\[([^\]]+)\])?/iu);
        if (sub) ensureNode(nodes, sub[1], sub[2] || sub[1], "group", null, classDefs);
      }
      continue;
    }

    const link = splitLinkLine(line);
    if (link) {
      registerNodesFromChunk(link.left);
      registerNodesFromChunk(link.right);
      const leftNodes = splitNodeChunk(link.left);
      const rightNodes = splitNodeChunk(link.right);
      const sourceId = extractNodeDefs(leftNodes.chunk).at(-1)?.id;
      const targetId = extractNodeDefs(rightNodes.chunk)[0]?.id;
      if (sourceId && targetId) {
        links.push({
          source: sourceId,
          target: targetId,
          label: link.label || undefined,
        });
      }
      continue;
    }

    registerNodesFromChunk(line);
  }

  for (const { ids, className } of pendingClasses) {
    const style = classDefs.get(className);
    if (!style) continue;
    for (const id of ids) {
      mergeNodeStyle(nodes.get(id), style);
    }
  }

  for (const { ids, style } of pendingStyles) {
    for (const id of ids) {
      mergeNodeStyle(nodes.get(id), style);
    }
  }

  return { type: "flowchart", nodes: [...nodes.values()], links };
}

function parseMindmap(source) {
  const cleaned = removeComments(source);
  const lines = cleaned.split(/\r?\n/u);
  const nodes = [];
  const links = [];
  const stack = [];
  let autoIndex = 0;
  const contentLines = [];
  for (const rawLine of lines) {
    if (!rawLine.trim()) continue;
    const trimmed = rawLine.trimStart();
    if (trimmed.startsWith("%%")) continue;
    if (/^mindmap\b/iu.test(trimmed)) continue;
    contentLines.push(rawLine);
  }
  const minIndent = contentLines.reduce((min, rawLine) => {
    const indent = rawLine.length - rawLine.trimStart().length;
    return Math.min(min, indent);
  }, Infinity);
  const baseIndent = Number.isFinite(minIndent) ? minIndent : 0;
  for (const rawLine of contentLines) {
    const trimmed = rawLine.trimStart();
    const indent = rawLine.length - trimmed.length;
    const depth = Math.max(0, Math.floor((indent - baseIndent) / 2));
    let label = trimmed;
    const rootWrapped = trimmed.match(/^root\s*\(\(([^)]+)\)\)/iu);
    if (rootWrapped) label = rootWrapped[1];
    else label = label.replace(/\(\(([^)]+)\)\)/u, "$1");
    label = label.replace(/::\s*icon\([^)]+\)/giu, "").trim();
    label = decodeLabel(label);
    if (!label) continue;
    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) stack.pop();
    autoIndex += 1;
    const id = slugId(label, autoIndex);
    nodes.push({ id, label, shape: depth === 0 ? "circle" : "rect" });
    const parent = stack[stack.length - 1];
    if (parent) links.push({ source: parent.id, target: id });
    stack.push({ depth, id });
  }
  return { type: "mindmap", nodes, links };
}

function mermaidToGraph(source) {
  const first = String(source || "")
    .replace(/^\uFEFF/u, "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("%%"));
  const head = first?.split(/\s+/u)[0]?.toLowerCase();
  if (head === "mindmap") return parseMindmap(source);
  if (FLOWCHART_TYPES.has(head)) return parseFlowchart(source);
  throw new Error("Diagrama não suportado para D3 (apenas graph, flowchart ou mindmap).");
}

const NODE_COLORS = {
  rect: { fill: "#e8f4ef", stroke: "#0b6e4f" },
  rounded: { fill: "#eef2f6", stroke: "#5c6b7a" },
  diamond: { fill: "#fff6e8", stroke: "#9a5b00" },
  circle: { fill: "#e8eef8", stroke: "#2563eb" },
  subroutine: { fill: "#f3e8ff", stroke: "#7c3aed" },
  flag: { fill: "#fde8e8", stroke: "#a32020" },
  group: { fill: "#f7f8fa", stroke: "#9aabba" },
};

let d3ModulePromise = null;

function loadD3Module() {
  if (!d3ModulePromise) {
    d3ModulePromise = import("https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm");
  }
  return d3ModulePromise;
}

function truncateLabel(label, maxChars) {
  const text = String(label || "");
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}

function wrapLongWord(word, maxChars) {
  const chunks = [];
  let rest = word;
  while (rest.length > maxChars) {
    chunks.push(rest.slice(0, maxChars));
    rest = rest.slice(maxChars);
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function wrapLabel(label, maxChars) {
  const text = String(label || "");
  if (!text) return "";
  const result = [];
  for (const paragraph of text.split("\n")) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;
    const words = trimmed.split(/\s+/u);
    let line = "";
    for (const word of words) {
      if (word.length > maxChars) {
        if (line) {
          result.push(line);
          line = "";
        }
        const parts = wrapLongWord(word, maxChars);
        result.push(...parts.slice(0, -1));
        line = parts[parts.length - 1] || "";
        continue;
      }
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length <= maxChars) {
        line = candidate;
      } else {
        if (line) result.push(line);
        line = word;
      }
    }
    if (line) result.push(line);
  }
  return result.length ? result.join("\n") : text.trim();
}

const LARGE_NODE_FONT_SIZE = 12;
const LARGE_NODE_LINE_HEIGHT = 1.2;
const LARGE_NODE_PAD_X = 14;
const LARGE_NODE_PAD_Y = 10;
const LARGE_NODE_CHAR_PX = 7.2;
const ROOT_NODE_SCALE = 1.3;

function splitNodeLines(label, config, displayMode) {
  const text = String(label || "");
  if (displayMode === "small") return [];
  if (displayMode === "medium") return [truncateLabel(text, 18)];
  if (config.autoLineWrap) return wrapLabel(text, config.wrapMaxChars).split("\n");
  return text.split("\n");
}

function measureNodeBox(lines, config, displayMode, scale = 1) {
  if (displayMode === "small") {
    const base = 18 * scale;
    return { w: base, h: base, r: base / 2 };
  }
  if (displayMode === "medium") {
    const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
    const w = Math.max(56, Math.min(120, longest * 6 + 24)) * scale;
    return { w, h: 34 * scale, r: 17 * scale };
  }
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
  const w = config.autoLineWrap
    ? Math.max(72, Math.ceil(config.wrapMaxChars * LARGE_NODE_CHAR_PX + LARGE_NODE_PAD_X * 2))
    : Math.max(
        72,
        Math.min(320, Math.ceil(longest * LARGE_NODE_CHAR_PX + LARGE_NODE_PAD_X * 2)),
      );
  const lineCount = Math.max(1, lines.length);
  const h = Math.max(
    36,
    Math.ceil(
      lineCount * LARGE_NODE_FONT_SIZE * LARGE_NODE_LINE_HEIGHT + LARGE_NODE_PAD_Y * 2,
    ),
  );
  return { w: w * scale, h: h * scale, r: (Math.max(w, h) / 2) * scale };
}

function appendMultilineNodeText(group, lines, textColor, options = {}) {
  const scale = options.scale ?? 1;
  const bold = Boolean(options.bold);
  const visible = lines.filter((line) => line.length > 0);
  if (!visible.length) return;
  const fontSize = LARGE_NODE_FONT_SIZE * scale;
  const text = group
    .append("text")
    .attr("text-anchor", "middle")
    .attr("fill", textColor)
    .attr("font-size", fontSize)
    .attr("font-weight", bold ? "700" : "normal")
    .attr("pointer-events", "none");
  const blockHeightEm = (visible.length - 1) * LARGE_NODE_LINE_HEIGHT;
  const startDyEm = -blockHeightEm / 2;
  for (const [index, line] of visible.entries()) {
    text
      .append("tspan")
      .attr("x", 0)
      .attr("dy", index === 0 ? `${startDyEm}em` : `${LARGE_NODE_LINE_HEIGHT}em`)
      .text(line);
  }
}

function displayLabel(config, label) {
  if (config.nodeDisplay === "small") return "";
  if (config.nodeDisplay === "medium") return truncateLabel(label, 18);
  if (config.autoLineWrap) return wrapLabel(label, config.wrapMaxChars);
  return label;
}

function estimateNodeSize(label, displayMode, config = null) {
  const cfg = config || DEFAULT_D3_CONFIG;
  const lines = splitNodeLines(label, cfg, displayMode);
  return measureNodeBox(lines, cfg, displayMode);
}

function resolveNodeColors(node, isDark) {
  const defaults = NODE_COLORS[node.shape] || NODE_COLORS.rect;
  return {
    fill: node.fill || defaults.fill,
    stroke: node.stroke || defaults.stroke,
    strokeWidth: node.strokeWidth ?? 1.5,
    textColor: node.color || (isDark ? "#e5e7eb" : "#1a2332"),
  };
}

function computeGraphCanvasSize(graph, config) {
  let maxW = 96;
  let maxH = 44;
  for (const node of graph.nodes) {
    const lines = splitNodeLines(node.label, config, config.nodeDisplay);
    const box = measureNodeBox(lines, config, config.nodeDisplay);
    maxW = Math.max(maxW, box.w);
    maxH = Math.max(maxH, box.h);
  }
  const n = Math.max(1, graph.nodes.length);
  const cols = Math.ceil(Math.sqrt(n * 1.6));
  const rows = Math.ceil(n / cols);
  return {
    width: Math.max(520, cols * (maxW + 56)),
    height: Math.max(380, rows * (maxH + 44)),
  };
}

function shuffleArray(items) {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function randomPointInCircle(cx, cy, radius) {
  const angle = Math.random() * Math.PI * 2;
  const distance = Math.sqrt(Math.random()) * radius;
  return [cx + Math.cos(angle) * distance, cy + Math.sin(angle) * distance];
}

const D3_ANIM_ITEM_DELAY_MS = 2;

async function createD3ForceRenderer(root, code, configPartial, options = {}) {
  const d3 = await loadD3Module();
  const config = normalizeD3Config(configPartial);
  const graph = mermaidToGraph(code);
  const isDark = Boolean(options.isDark);
  const zoomEnabled = Boolean(options.zoomEnabled);
  const initialView = options.initialView || null;
  const onViewChange =
    typeof options.onViewChange === "function" ? options.onViewChange : null;

  const MIN_ZOOM = 0.05;
  const MAX_ZOOM = 8;
  const FIT_PADDING = 20;

  let simWidth = 640;
  let simHeight = 420;
  let viewportWidth = simWidth;
  let viewportHeight = simHeight;
  let autoFitView = true;

  root.replaceChildren();
  root.classList.add("d3-force-root");

  const wrap = document.createElement("div");
  wrap.className = "d3-force-wrap";
  root.appendChild(wrap);

  const sidebar = document.createElement("aside");
  sidebar.className = "d3-node-sidebar";
  sidebar.hidden = true;
  sidebar.innerHTML =
    '<header class="d3-node-sidebar-header"><h3></h3><button type="button" class="d3-sidebar-close" aria-label="Fechar">×</button></header><section class="d3-node-sidebar-body"></section>';
  wrap.appendChild(sidebar);

  const viewport = document.createElement("div");
  viewport.className = "d3-force-viewport";
  wrap.appendChild(viewport);

  const controls = document.createElement("div");
  controls.className = "d3-force-controls";
  if (config.showPlayPause) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "d3-force-playpause";
    btn.textContent = config.physicsEnabled ? "⏸" : "▶";
    btn.title = config.physicsEnabled ? "Pausar física" : "Retomar física";
    controls.appendChild(btn);
  }
  viewport.appendChild(controls);

  const svg = d3
    .select(viewport)
    .append("svg")
    .attr("class", "d3-force-svg")
    .attr("width", "100%")
    .attr("height", "100%");

  const g = svg.append("g");
  const linkLayer = g.append("g").attr("class", "links");
  const nodeLayer = g.append("g").attr("class", "nodes");

  let zoomTransform = d3.zoomIdentity;
  /** @type {import("https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm").ZoomBehavior<SVGSVGElement, unknown> | null} */
  let zoomBehavior = null;
  let viewNotifyTimer = 0;

  function clampZoomScale(value) {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value) || 1));
  }

  function normalizeViewInput(view) {
    if (!view || typeof view !== "object") return null;
    const scale = clampZoomScale(view.scale);
    const cx = Number(view.cx);
    const cy = Number(view.cy);
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
    return { scale, cx, cy };
  }

  function getView() {
    const k = zoomTransform.k || 1;
    return {
      scale: k,
      cx: (simWidth / 2 - zoomTransform.x) / k,
      cy: (simHeight / 2 - zoomTransform.y) / k,
    };
  }

  function scheduleViewNotify() {
    if (!onViewChange) return;
    if (viewNotifyTimer) window.clearTimeout(viewNotifyTimer);
    viewNotifyTimer = window.setTimeout(() => {
      viewNotifyTimer = 0;
      onViewChange(getView());
    }, 120);
  }

  function applyZoomTransform(transform) {
    zoomTransform = transform;
    g.attr("transform", transform);
    scheduleViewNotify();
  }

  function viewToTransform(view) {
    const normalized = normalizeViewInput(view);
    if (!normalized) return null;
    const k = normalized.scale;
    return d3.zoomIdentity
      .translate(simWidth / 2 - normalized.cx * k, simHeight / 2 - normalized.cy * k)
      .scale(k);
  }

  function graphBounds() {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const d of nodes) {
      const size = d._size || { w: 40, h: 40, r: 20 };
      const pad = Math.max(size.w, size.h, (size.r || 0) * 2) / 2 + 24;
      if (!Number.isFinite(d.x) || !Number.isFinite(d.y)) continue;
      x0 = Math.min(x0, d.x - pad);
      y0 = Math.min(y0, d.y - pad);
      x1 = Math.max(x1, d.x + pad);
      y1 = Math.max(y1, d.y + pad);
    }
    if (!Number.isFinite(x0)) return null;
    return {
      midX: (x0 + x1) / 2,
      midY: (y0 + y1) / 2,
      w: x1 - x0,
      h: y1 - y0,
    };
  }

  function setView(view) {
    if (!zoomBehavior) return false;
    const transform = viewToTransform(view);
    if (!transform) return false;
    svg.call(zoomBehavior.transform, transform);
    return true;
  }

  function fitView() {
    if (!zoomBehavior) return false;
    const bounds = graphBounds();
    if (!bounds || bounds.w <= 0 || bounds.h <= 0) return false;
    const k = clampZoomScale(
      Math.min(
        (simWidth - FIT_PADDING * 2) / bounds.w,
        (simHeight - FIT_PADDING * 2) / bounds.h,
      ),
    );
    const transform = d3.zoomIdentity
      .translate(simWidth / 2 - bounds.midX * k, simHeight / 2 - bounds.midY * k)
      .scale(k);
    svg.call(zoomBehavior.transform, transform);
    return true;
  }

  function scheduleAutoFit() {
    if (!zoomEnabled || !autoFitView) return;
    fitView();
    for (const delay of [250, 700, 1500]) {
      window.setTimeout(() => {
        if (autoFitView) fitView();
      }, delay);
    }
  }

  function zoomBy(factor, px, py) {
    if (!zoomBehavior) return;
    const cx = px != null ? px : simWidth / 2;
    const cy = py != null ? py : simHeight / 2;
    svg.call(zoomBehavior.scaleBy, factor, [cx, cy]);
  }

  function installZoom() {
    viewport.classList.add("d3-zoom-enabled");
    zoomBehavior = d3
      .zoom()
      .scaleExtent([MIN_ZOOM, MAX_ZOOM])
      .filter((event) => {
        if (event.type === "wheel") return true;
        if (event.type === "mousedown" || event.type === "touchstart") {
          const target = event.target;
          if (target && typeof target.closest === "function") {
            if (target.closest(".node")) return false;
            if (target.closest(".d3-force-controls")) return false;
            if (target.closest(".d3-node-sidebar")) return false;
          }
          return !event.ctrlKey && !event.button;
        }
        return !event.ctrlKey;
      })
      .on("zoom", (event) => {
        if (event.sourceEvent) autoFitView = false;
        applyZoomTransform(event.transform);
      });
    svg.call(zoomBehavior);
  }

  function removeZoom() {
    viewport.classList.remove("d3-zoom-enabled");
    svg.on(".zoom", null);
    zoomBehavior = null;
    zoomTransform = d3.zoomIdentity;
    g.attr("transform", null);
  }

  function setZoomEnabled(enabled, view = null) {
    if (enabled) {
      if (!zoomBehavior) installZoom();
      autoFitView = !normalizeViewInput(view);
      if (view && setView(view)) {
        autoFitView = false;
        return;
      }
      fitView();
      scheduleAutoFit();
      return;
    }
    removeZoom();
  }

  function pointerOnGraph(event) {
    return d3.pointer(event, g.node());
  }

  function updateDraggedNode(d, x, y) {
    if (physicsRunning) {
      d.fx = x;
      d.fy = y;
      return;
    }
    d.x = x;
    d.y = y;
    d.fx = x;
    d.fy = y;
    ticked();
  }

  let simulation = null;
  let physicsRunning = config.physicsEnabled;

  wrap.dataset.theme = isDark ? "dark" : "light";

  function measureViewport() {
    const rect = viewport.getBoundingClientRect();
    const docEl = document.documentElement;
    const pickMax = (values, fallback) => {
      const valid = values.filter((n) => Number.isFinite(n) && n > 0);
      return Math.max(fallback, ...valid);
    };
    return {
      w: Math.ceil(
        pickMax(
          [rect.width, viewport.clientWidth, root.clientWidth, docEl.clientWidth, window.innerWidth],
          640,
        ),
      ),
      h: Math.ceil(
        pickMax(
          [
            rect.height,
            viewport.clientHeight,
            root.clientHeight,
            wrap.clientHeight,
            docEl.clientHeight,
            window.innerHeight,
          ],
          420,
        ),
      ),
    };
  }

  function remapCoord(value, prevSize, nextSize) {
    if (!Number.isFinite(value) || prevSize <= 0) return nextSize / 2;
    return ((value - prevSize / 2) / prevSize) * nextSize + nextSize / 2;
  }

  function syncSimToViewport(nextW, nextH, { scaleNodes = false } = {}) {
    const prevW = simWidth || nextW;
    const prevH = simHeight || nextH;
    if (scaleNodes && simulation && (prevW !== nextW || prevH !== nextH)) {
      for (const d of nodes) {
        d.x = remapCoord(d.x, prevW, nextW);
        d.y = remapCoord(d.y, prevH, nextH);
        if (d.fx != null) d.fx = remapCoord(d.fx, prevW, nextW);
        if (d.fy != null) d.fy = remapCoord(d.fy, prevH, nextH);
      }
    }
    viewportWidth = nextW;
    viewportHeight = nextH;
    simWidth = nextW;
    simHeight = nextH;
    svg.attr("viewBox", `0 0 ${simWidth} ${simHeight}`);
  }

  function resize({ fromContainer = false } = {}) {
    const { w: nextW, h: nextH } = measureViewport();
    const changed = nextW !== simWidth || nextH !== simHeight;
    if (changed || fromContainer) {
      syncSimToViewport(nextW, nextH, { scaleNodes: Boolean(simulation) });
    }
    simulation?.force("center", d3.forceCenter(simWidth / 2, simHeight / 2));
    if (simulation) {
      adaptForcesToCanvas();
      simulation.alpha(0.35).restart();
    }
    if (zoomEnabled && zoomBehavior) {
      if (fromContainer) autoFitView = true;
      if (autoFitView) {
        fitView();
        if (fromContainer || changed) scheduleAutoFit();
      }
    }
  }

  function relayout() {
    resize({ fromContainer: true });
  }

  syncSimToViewport(measureViewport().w, measureViewport().h);

  const nodes = graph.nodes.map((node) => ({
    ...node,
    x: simWidth / 2 + (Math.random() - 0.5) * simWidth * 0.55,
    y: simHeight / 2 + (Math.random() - 0.5) * simHeight * 0.55,
  }));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const links = graph.links
    .filter((link) => nodeById.has(link.source) && nodeById.has(link.target))
    .map((link) => ({ ...link }));

  const parents = new Map(nodes.map((node) => [node.id, []]));
  const children = new Map(nodes.map((node) => [node.id, []]));
  for (const link of links) {
    children.get(link.source)?.push(link.target);
    parents.get(link.target)?.push(link.source);
  }

  for (const n of nodes) {
    n._isRoot = (parents.get(n.id) || []).length === 0;
  }

  function adaptForcesToCanvas() {
    if (!simulation) return;
    const n = Math.max(1, nodes.length);
    const area = (simWidth * simHeight) / n;
    const spread = Math.sqrt(Math.max(800, area));
    const f = config.force;
    simulation.force("link").distance(Math.max(f.linkDistance, spread * 0.72));
    simulation.force("charge").strength(Math.min(f.chargeStrength, -spread * 1.45));
  }

  function buildSimulation() {
    const f = config.force;
    simulation = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3
          .forceLink(links)
          .id((d) => d.id)
          .distance(f.linkDistance)
          .strength(f.linkStrength),
      )
      .force("charge", d3.forceManyBody().strength(f.chargeStrength))
      .force("center", d3.forceCenter(simWidth / 2, simHeight / 2).strength(f.centerStrength))
      .force("collision", d3.forceCollide().radius((d) => {
        const size = d._size || { w: 36, h: 36 };
        return Math.max(size.w, size.h) / 2 + f.collisionRadius;
      }))
      .alphaDecay(f.alphaDecay)
      .velocityDecay(f.velocityDecay);
    adaptForcesToCanvas();
    simulation.on("end", () => {
      if (autoFitView && zoomBehavior) fitView();
    });
    if (!physicsRunning) simulation.stop();
  }

  const link = linkLayer
    .selectAll("g.link")
    .data(links)
    .join("g")
    .attr("class", "link");

  link
    .append("line")
    .attr("stroke", isDark ? "#4b5563" : "#9aabba")
    .attr("stroke-width", 1.5)
    .attr("marker-end", "url(#arrow)");

  link
    .filter((d) => Boolean(d.label))
    .append("text")
    .attr("class", "link-label")
    .attr("text-anchor", "middle")
    .attr("fill", isDark ? "#cbd5e1" : "#5c6b7a")
    .attr("font-size", 11)
    .text((d) => d.label);

  svg
    .append("defs")
    .append("marker")
    .attr("id", "arrow")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 18)
    .attr("refY", 0)
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", isDark ? "#64748b" : "#9aabba");

  const node = nodeLayer
    .selectAll("g.node")
    .data(nodes)
    .join("g")
    .attr("class", "node")
    .style("cursor", config.mouseMode === "drag" ? "grab" : "pointer");

  node.each(function (d) {
    const group = d3.select(this);
    const colors = resolveNodeColors(d, isDark);
    const lines = splitNodeLines(d.label, config, config.nodeDisplay);
    const isRoot = Boolean(d._isRoot);
    const rootScale = isRoot ? ROOT_NODE_SCALE : 1;
    if (isRoot) group.classed("node--root", true);
    const size = measureNodeBox(lines, config, config.nodeDisplay, rootScale);
    d._size = size;
    if (config.nodeDisplay === "small") {
      group
        .append("circle")
        .attr("r", size.r)
        .attr("fill", colors.fill)
        .attr("stroke", colors.stroke)
        .attr("stroke-width", colors.strokeWidth);
    } else if (d.shape === "diamond") {
      const hw = size.w / 2;
      const hh = size.h / 2;
      group
        .append("polygon")
        .attr("points", `0,${-hh} ${hw},0 0,${hh} ${-hw},0`)
        .attr("fill", colors.fill)
        .attr("stroke", colors.stroke)
        .attr("stroke-width", colors.strokeWidth);
    } else if (d.shape === "circle") {
      group
        .append("circle")
        .attr("r", Math.max(size.w, size.h) / 2)
        .attr("fill", colors.fill)
        .attr("stroke", colors.stroke)
        .attr("stroke-width", colors.strokeWidth);
    } else {
      group
        .append("rect")
        .attr("x", -size.w / 2)
        .attr("y", -size.h / 2)
        .attr("width", size.w)
        .attr("height", size.h)
        .attr("rx", d.shape === "rounded" ? 10 : 4)
        .attr("fill", colors.fill)
        .attr("stroke", colors.stroke)
        .attr("stroke-width", colors.strokeWidth);
    }
    if (config.nodeDisplay !== "small") {
      appendMultilineNodeText(group, lines, colors.textColor, {
        scale: rootScale,
        bold: isRoot,
      });
    }
    if (config.nodeDisplay !== "large") group.append("title").text(d.label);
  });

  const sidebarTitle = sidebar.querySelector("h3");
  const sidebarBody = sidebar.querySelector(".d3-node-sidebar-body");
  const sidebarClose = sidebar.querySelector(".d3-sidebar-close");

  function openSidebar(node) {
    if (!config.nodeSidebar || !sidebarTitle || !sidebarBody) return;
    sidebarTitle.textContent = node.label;
    const parentLabels = (parents.get(node.id) || [])
      .map((id) => nodeById.get(id)?.label)
      .filter(Boolean);
    const childLabels = (children.get(node.id) || [])
      .map((id) => nodeById.get(id)?.label)
      .filter(Boolean);
    sidebarBody.innerHTML = "";
    const full = document.createElement("p");
    full.className = "d3-sidebar-fulltext";
    full.textContent = node.label;
    sidebarBody.appendChild(full);
    if (parentLabels.length) {
      const block = document.createElement("div");
      block.innerHTML = `<strong>Pais</strong><ul>${parentLabels.map((label) => `<li>${label}</li>`).join("")}</ul>`;
      sidebarBody.appendChild(block);
    }
    if (childLabels.length) {
      const block = document.createElement("div");
      block.innerHTML = `<strong>Filhos</strong><ul>${childLabels.map((label) => `<li>${label}</li>`).join("")}</ul>`;
      sidebarBody.appendChild(block);
    }
    sidebar.hidden = false;
    wrap.classList.add("has-sidebar");
  }

  sidebarClose?.addEventListener("click", () => {
    sidebar.hidden = true;
    wrap.classList.remove("has-sidebar");
  });

  node.on("click", (event, d) => {
    if (!config.nodeSidebar) return;
    event.stopPropagation();
    openSidebar(d);
  });

  if (config.mouseMode === "drag") {
    node.call(
      d3
        .drag()
        .filter((event) => {
          if (event.button != null && event.button !== 0) return false;
          return physicsRunning || config.dragWhenPaused;
        })
        .on("start", (event, d) => {
          if (!event.active && physicsRunning) simulation?.alphaTarget(0.3).restart();
          const [x, y] = pointerOnGraph(event);
          updateDraggedNode(d, x, y);
        })
        .on("drag", (event, d) => {
          const [x, y] = pointerOnGraph(event);
          updateDraggedNode(d, x, y);
        })
        .on("end", (event, d) => {
          if (!event.active && physicsRunning) simulation?.alphaTarget(0);
          if (physicsRunning) {
            d.fx = null;
            d.fy = null;
          } else if (config.dragWhenPaused) {
            d.fx = d.x;
            d.fy = d.y;
            ticked();
          }
        }),
    );
  } else {
    svg.on("mousemove", (event) => {
      if (!physicsRunning || !simulation) return;
      const [mx, my] = d3.pointer(event, svg.node());
      const [wx, wy] = zoomBehavior ? zoomTransform.invert([mx, my]) : [mx, my];
      for (const d of nodes) {
        const dx = d.x - wx;
        const dy = d.y - wy;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist < 120) {
          d.vx = (d.vx || 0) + (dx / dist) * (120 - dist) * 0.08;
          d.vy = (d.vy || 0) + (dy / dist) * (120 - dist) * 0.08;
        }
      }
      simulation.alpha(0.2).restart();
    });
  }

  function ticked() {
    link
      .select("line")
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);
    link
      .select("text")
      .attr("x", (d) => (d.source.x + d.target.x) / 2)
      .attr("y", (d) => (d.source.y + d.target.y) / 2 - 6);
    node.attr("transform", (d) => `translate(${d.x},${d.y})`);
  }

  buildSimulation();
  simulation?.on("tick", ticked);

  const playBtn = controls.querySelector(".d3-force-playpause");
  playBtn?.addEventListener("click", () => {
    physicsRunning = !physicsRunning;
    if (physicsRunning) {
      simulation?.alpha(0.5).restart();
      playBtn.textContent = "⏸";
      playBtn.title = "Pausar física";
    } else {
      simulation?.stop();
      playBtn.textContent = "▶";
      playBtn.title = "Retomar física";
    }
  });

  function getLinkEndpoints(linkData) {
    const sourceId = typeof linkData.source === "object" ? linkData.source.id : linkData.source;
    const targetId = typeof linkData.target === "object" ? linkData.target.id : linkData.target;
    return { sourceId, targetId };
  }

  function buildRevealPlan() {
    /** @type {Array<{type: string, nodeId?: string, parentId?: string, kind?: string, sourceId?: string, targetId?: string}>} */
    const actions = [];
    const scheduledNodes = new Set();
    const scheduledLinks = new Set();

    function scheduleLink(sourceId, targetId) {
      const key = `${sourceId}->${targetId}`;
      if (scheduledLinks.has(key)) return;
      scheduledLinks.add(key);
      actions.push({ type: "link", sourceId, targetId });
    }

    function scheduleNode(nodeId, opts = {}) {
      if (scheduledNodes.has(nodeId)) return false;
      scheduledNodes.add(nodeId);
      actions.push({
        type: "node",
        nodeId,
        parentId: opts.parentId,
        kind: opts.kind,
      });
      return true;
    }

    const roots = nodes.filter((n) => (parents.get(n.id) || []).length === 0);
    const stack = [];

    for (const root of shuffleArray(roots)) {
      scheduleNode(root.id, { kind: "root" });
      stack.push(root);
    }

    while (stack.length > 0) {
      const pick = Math.floor(Math.random() * stack.length);
      const parent = stack.splice(pick, 1)[0];
      const childIds = shuffleArray([...(children.get(parent.id) || [])]);
      const expandable = [];

      for (const childId of childIds) {
        if (scheduleNode(childId, { parentId: parent.id })) {
          expandable.push(nodeById.get(childId));
        }
        scheduleLink(parent.id, childId);
      }

      if (expandable.length === 0) continue;

      const nextIdx = Math.floor(Math.random() * expandable.length);
      for (let i = 0; i < expandable.length; i += 1) {
        if (i !== nextIdx && expandable[i]) stack.push(expandable[i]);
      }
      if (expandable[nextIdx]) stack.push(expandable[nextIdx]);
    }

    for (const n of nodes) {
      if (!scheduledNodes.has(n.id)) {
        scheduleNode(n.id, { kind: "root" });
      }
    }
    for (const l of links) {
      const { sourceId, targetId } = getLinkEndpoints(l);
      scheduleLink(sourceId, targetId);
    }

    return actions;
  }

  function createNodeAnimator() {
    if (!config.animateNodes) return null;

    const actionQueue = buildRevealPlan();
    let queueIndex = 0;
    let cycleTimer = 0;
    let itemTimer = 0;
    let batchActive = false;

    node.style("opacity", 0);
    link.style("opacity", 0);
    for (const n of nodes) {
      n.x = simWidth / 2;
      n.y = simHeight / 2;
      n.fx = simWidth / 2;
      n.fy = simHeight / 2;
    }
    ticked();
    physicsRunning = config.physicsEnabled;
    if (physicsRunning) {
      simulation?.alpha(0.5).restart();
      if (playBtn) {
        playBtn.textContent = "⏸";
        playBtn.title = "Pausar física";
      }
    } else {
      simulation?.stop();
      if (playBtn) {
        playBtn.textContent = "▶";
        playBtn.title = "Retomar física";
      }
    }

    function positionNode(action) {
      const rootRadius = simHeight * (config.animateRootRadiusPct / 100);
      if (action.kind === "root" || !action.parentId) {
        return randomPointInCircle(simWidth / 2, simHeight / 2, rootRadius);
      }
      const parent = nodeById.get(action.parentId);
      const px = parent?.x ?? simWidth / 2;
      const py = parent?.y ?? simHeight / 2;
      const radius = (parent?._size?.w ?? 80) * (config.animateChildRadiusPct / 100);
      return randomPointInCircle(px, py, radius);
    }

    function executeAction(action) {
      if (action.type === "node") {
        const n = nodeById.get(action.nodeId);
        if (!n) return;
        const [x, y] = positionNode(action);
        n.x = x;
        n.y = y;
        n.fx = null;
        n.fy = null;
        node.filter((d) => d.id === n.id).style("opacity", 1);
      } else if (action.type === "link") {
        const key = `${action.sourceId}->${action.targetId}`;
        link
          .filter((l) => {
            const end = getLinkEndpoints(l);
            return `${end.sourceId}->${end.targetId}` === key;
          })
          .style("opacity", 1);
      }
      ticked();
      if (physicsRunning) simulation?.alpha(0.3).restart();
    }

    function runBatchItem(batchRemaining, onBatchDone) {
      if (queueIndex >= actionQueue.length) {
        onBatchDone();
        return;
      }
      executeAction(actionQueue[queueIndex]);
      queueIndex += 1;
      const remaining = batchRemaining - 1;
      if (remaining <= 0 || queueIndex >= actionQueue.length) {
        onBatchDone();
        return;
      }
      itemTimer = window.setTimeout(
        () => runBatchItem(remaining, onBatchDone),
        D3_ANIM_ITEM_DELAY_MS,
      );
    }

    function startCycle() {
      if (queueIndex >= actionQueue.length) {
        stop();
        return;
      }
      if (batchActive) return;
      batchActive = true;
      const batchSize = Math.max(1, Math.round(config.animateConcurrent));
      runBatchItem(batchSize, () => {
        batchActive = false;
        if (queueIndex >= actionQueue.length) stop();
      });
    }

    function start() {
      if (actionQueue.length === 0) return;
      const interval = Math.max(50, Math.round(config.animateSpeed));
      startCycle();
      cycleTimer = window.setInterval(startCycle, interval);
    }

    function stop() {
      if (cycleTimer) window.clearInterval(cycleTimer);
      if (itemTimer) window.clearTimeout(itemTimer);
      cycleTimer = 0;
      itemTimer = 0;
      batchActive = false;
      if (queueIndex >= actionQueue.length && autoFitView && zoomBehavior) {
        fitView();
      }
    }

    return { start, stop };
  }

  const nodeAnimator = createNodeAnimator();

  const ro = new ResizeObserver(() => resize({ fromContainer: true }));
  ro.observe(viewport);
  ro.observe(wrap);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      resize({ fromContainer: true });
      if (zoomEnabled) {
        if (!zoomBehavior) installZoom();
        if (initialView && setView(initialView)) {
          autoFitView = false;
        } else if (!initialView) {
          scheduleAutoFit();
        }
      }
      nodeAnimator?.start();
    });
  });

  return {
    measureHeight() {
      return Math.max(
        280,
        Math.ceil(
          viewport.getBoundingClientRect().height || viewport.clientHeight || viewportHeight,
        ),
      );
    },
    getView() {
      return zoomBehavior ? getView() : null;
    },
    setView(view) {
      return setView(view);
    },
    fitView() {
      return fitView();
    },
    resetView() {
      return fitView();
    },
    zoomBy(factor, px, py) {
      zoomBy(factor, px, py);
    },
    setZoomEnabled(enabled, view = null) {
      setZoomEnabled(enabled, view);
    },
    relayout() {
      relayout();
    },
    getZoomScale() {
      return zoomTransform.k || 1;
    },
    async exportPng() {
      const serializer = new XMLSerializer();
      const clone = svg.node()?.cloneNode(true);
      if (!clone) throw new Error("SVG indisponível.");
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      clone.setAttribute("width", String(simWidth));
      clone.setAttribute("height", String(simHeight));
      const svgText = serializer.serializeToString(clone);
      const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
      const img = new Image();
      return new Promise((resolve, reject) => {
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = simWidth * 2;
          canvas.height = simHeight * 2;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = isDark ? "#0f1419" : "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/png"));
        };
        img.onerror = () => reject(new Error("Falha ao exportar PNG D3."));
        img.src = url;
      });
    },
    destroy() {
      nodeAnimator?.stop();
      if (viewNotifyTimer) window.clearTimeout(viewNotifyTimer);
      removeZoom();
      ro.disconnect();
      simulation?.stop();
      simulation = null;
      root.replaceChildren();
      root.classList.remove("d3-force-root");
    },
  };
}
