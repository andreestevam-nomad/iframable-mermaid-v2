/**
 * Converte diagramas Mermaid graph/flowchart/mindmap em grafo { nodes, links } para D3.
 */

import { removeComments } from "./mermaid-text.js";

const FLOWCHART_TYPES = new Set(["flowchart", "graph"]);
const ARROW_RE =
  /(-{1,2}|={1,2}|\.-|-\.|o-|x-|~)(?:-{1,2}|={1,2}|\.-|-\.|o-|x-|~)?>/u;

/** @typedef {{ id: string, label: string, shape?: string, fill?: string, stroke?: string, strokeWidth?: number, color?: string }} GraphNode */
/** @typedef {{ source: string, target: string, label?: string }} GraphLink */
/** @typedef {{ nodes: GraphNode[], links: GraphLink[], type: string }} GraphData */

/**
 * @param {string} source
 * @returns {"flowchart" | "mindmap" | null}
 */
export function detectGraphDiagramType(source) {
  const first = String(source || "")
    .replace(/^\uFEFF/u, "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("%%"));
  if (!first) return null;
  const head = first.split(/\s+/u)[0]?.toLowerCase();
  if (FLOWCHART_TYPES.has(head)) return "flowchart";
  if (head === "mindmap") return "mindmap";
  return null;
}

/**
 * @param {string} source
 * @returns {boolean}
 */
export function isD3CompatibleDiagram(source) {
  return detectGraphDiagramType(source) != null;
}

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

/** @typedef {{ fill?: string, stroke?: string, strokeWidth?: number, color?: string }} NodeStyle */

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
  /** @type {NodeStyle} */
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

/**
 * @param {Map<string, GraphNode>} nodes
 * @param {string} id
 * @param {string} [label]
 * @param {string} [shape]
 * @param {string | null} [className]
 * @param {Map<string, NodeStyle>} [classDefs]
 */
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

/**
 * @param {string} chunk
 * @returns {Array<{ id: string, label?: string, shape?: string }>}
 */
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

/**
 * @param {string} line
 * @returns {{ left: string, label: string, right: string } | null}
 */
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

/**
 * @param {string} source
 * @returns {GraphData}
 */
export function parseFlowchart(source) {
  const cleaned = removeComments(source);
  const lines = cleaned.split(/\r?\n/u);
  /** @type {Map<string, GraphNode>} */
  const nodes = new Map();
  /** @type {GraphLink[]} */
  const links = [];
  /** @type {Map<string, NodeStyle>} */
  const classDefs = new Map();
  /** @type {Array<{ ids: string[], className: string }>} */
  const pendingClasses = [];
  /** @type {Array<{ ids: string[], style: NodeStyle }>} */
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

  return {
    type: "flowchart",
    nodes: [...nodes.values()],
    links,
  };
}

/**
 * @param {string} source
 * @returns {GraphData}
 */
export function parseMindmap(source) {
  const cleaned = removeComments(source);
  const lines = cleaned.split(/\r?\n/u);
  /** @type {GraphNode[]} */
  const nodes = [];
  /** @type {GraphLink[]} */
  const links = [];
  /** @type {Array<{ depth: number, id: string }>} */
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
    if (rootWrapped) {
      label = rootWrapped[1];
    } else {
      label = label.replace(/\(\(([^)]+)\)\)/u, "$1");
    }
    label = label.replace(/::\s*icon\([^)]+\)/giu, "").trim();
    label = decodeLabel(label);
    if (!label) continue;

    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }

    autoIndex += 1;
    const id = slugId(label, autoIndex);
    nodes.push({ id, label, shape: depth === 0 ? "circle" : "rect" });

    const parent = stack[stack.length - 1];
    if (parent) {
      links.push({ source: parent.id, target: id });
    }
    stack.push({ depth, id });
  }

  return { type: "mindmap", nodes, links };
}

/**
 * @param {string} source
 * @returns {GraphData}
 */
export function mermaidToGraph(source) {
  const type = detectGraphDiagramType(source);
  if (type === "mindmap") return parseMindmap(source);
  if (type === "flowchart") return parseFlowchart(source);
  throw new Error("Diagrama não suportado para D3 (apenas graph, flowchart ou mindmap).");
}
