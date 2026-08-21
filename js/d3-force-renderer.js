/**
 * Renderizador D3 force para grafos derivados de Mermaid graph/flowchart/mindmap.
 */

import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";
import { mermaidToGraph } from "./mermaid-to-graph.js";
import { DEFAULT_D3_CONFIG, normalizeD3Config } from "./d3-config.js";

const NODE_COLORS = {
  rect: { fill: "#e8f4ef", stroke: "#0b6e4f" },
  rounded: { fill: "#eef2f6", stroke: "#5c6b7a" },
  diamond: { fill: "#fff6e8", stroke: "#9a5b00" },
  circle: { fill: "#e8eef8", stroke: "#2563eb" },
  subroutine: { fill: "#f3e8ff", stroke: "#7c3aed" },
  flag: { fill: "#fde8e8", stroke: "#a32020" },
  group: { fill: "#f7f8fa", stroke: "#9aabba" },
};

/**
 * @param {string} label
 * @param {number} maxChars
 */
function truncateLabel(label, maxChars) {
  const text = String(label || "");
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}

/**
 * @param {string} word
 * @param {number} maxChars
 */
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

/**
 * @param {string} label
 * @param {number} maxChars
 */
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

function splitNodeLines(label, config, displayMode) {
  const text = String(label || "");
  if (displayMode === "small") return [];
  if (displayMode === "medium") return [truncateLabel(text, 18)];
  if (config.autoLineWrap) return wrapLabel(text, config.wrapMaxChars).split("\n");
  return text.split("\n");
}

function measureNodeBox(lines, config, displayMode) {
  if (displayMode === "small") return { w: 18, h: 18, r: 9 };
  if (displayMode === "medium") {
    const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
    const w = Math.max(56, Math.min(120, longest * 6 + 24));
    return { w, h: 34, r: 17 };
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
  return { w, h, r: Math.max(w, h) / 2 };
}

function appendMultilineNodeText(group, lines, textColor) {
  const visible = lines.filter((line) => line.length > 0);
  if (!visible.length) return;
  const text = group
    .append("text")
    .attr("text-anchor", "middle")
    .attr("fill", textColor)
    .attr("font-size", LARGE_NODE_FONT_SIZE)
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

/**
 * @param {import('./d3-config.js').D3Config} config
 * @param {string} label
 */
function displayLabel(config, label) {
  if (config.nodeDisplay === "small") return "";
  if (config.nodeDisplay === "medium") return truncateLabel(label, 18);
  if (config.autoLineWrap) return wrapLabel(label, config.wrapMaxChars);
  return label;
}

/**
 * @param {string} label
 * @param {import('./d3-config.js').NodeDisplayMode} displayMode
 * @param {import('./d3-config.js').D3Config} [config]
 */
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

/**
 * @typedef {Object} ForceRendererHandle
 * @property {() => number} measureHeight
 * @property {() => Promise<string>} exportPng
 * @property {() => void} destroy
 */

/**
 * @param {HTMLElement} root
 * @param {string} code
 * @param {Partial<import('./d3-config.js').D3Config>} configPartial
 * @param {{ isDark?: boolean }} [options]
 * @returns {ForceRendererHandle}
 */
export function createD3ForceRenderer(root, code, configPartial, options = {}) {
  const config = normalizeD3Config(configPartial);
  const graph = mermaidToGraph(code);
  const isDark = Boolean(options.isDark);

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

  /** @type {d3.Simulation<any, undefined> | null} */
  let simulation = null;
  let physicsRunning = config.physicsEnabled;
  let width = 640;
  let height = 420;

  const nodes = graph.nodes.map((node) => ({
    ...node,
    x: width / 2 + (Math.random() - 0.5) * 80,
    y: height / 2 + (Math.random() - 0.5) * 80,
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

  function applyTheme() {
    wrap.dataset.theme = isDark ? "dark" : "light";
  }
  applyTheme();

  function resize() {
    const rect = viewport.getBoundingClientRect();
    width = Math.max(320, Math.ceil(rect.width || root.clientWidth || 640));
    height = Math.max(
      280,
      Math.ceil(rect.height || root.clientHeight || viewport.parentElement?.clientHeight || 420),
    );
    svg.attr("viewBox", `0 0 ${width} ${height}`);
    simulation?.force("center", d3.forceCenter(width / 2, height / 2));
    simulation?.alpha(0.3).restart();
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
      .force("center", d3.forceCenter(width / 2, height / 2).strength(f.centerStrength))
      .force("collision", d3.forceCollide().radius((d) => {
        const size = d._size || { w: 36, h: 36 };
        return Math.max(size.w, size.h) / 2 + f.collisionRadius;
      }))
      .alphaDecay(f.alphaDecay)
      .velocityDecay(f.velocityDecay);

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
    const size = measureNodeBox(lines, config, config.nodeDisplay);
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
        .attr(
          "points",
          `0,${-hh} ${hw},0 0,${hh} ${-hw},0`,
        )
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
      appendMultilineNodeText(group, lines, colors.textColor);
    }

    if (config.nodeDisplay !== "large") {
      group.append("title").text(d.label);
    }
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

  function closeSidebar() {
    sidebar.hidden = true;
    wrap.classList.remove("has-sidebar");
  }

  sidebarClose?.addEventListener("click", closeSidebar);

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
          updateDraggedNode(d, event.x, event.y);
          d3.select(event.sourceEvent.target?.closest?.(".node") || this).style(
            "cursor",
            "grabbing",
          );
        })
        .on("drag", (event, d) => {
          updateDraggedNode(d, event.x, event.y);
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
          d3.select(event.sourceEvent.target?.closest?.(".node") || this).style(
            "cursor",
            "grab",
          );
        }),
    );
  } else {
    svg.on("mousemove", (event) => {
      if (!physicsRunning || !simulation) return;
      const [mx, my] = d3.pointer(event, svg.node());
      for (const d of nodes) {
        const dx = d.x - mx;
        const dy = d.y - my;
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

  const ro = new ResizeObserver(() => resize());
  ro.observe(viewport);
  resize();

  return {
    measureHeight() {
      return Math.max(
        280,
        Math.ceil(viewport.getBoundingClientRect().height || viewport.clientHeight || height),
      );
    },
    async exportPng() {
      const serializer = new XMLSerializer();
      const clone = /** @type {SVGSVGElement} */ (svg.node()?.cloneNode(true));
      if (!clone) throw new Error("SVG indisponível.");
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      clone.setAttribute("width", String(width));
      clone.setAttribute("height", String(height));
      const svgText = serializer.serializeToString(clone);
      const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
      const img = new Image();
      return new Promise((resolve, reject) => {
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = width * 2;
          canvas.height = height * 2;
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
      ro.disconnect();
      simulation?.stop();
      simulation = null;
      root.replaceChildren();
      root.classList.remove("d3-force-root");
    },
  };
}

export { mermaidToGraph };
