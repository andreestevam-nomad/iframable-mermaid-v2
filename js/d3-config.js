/**
 * Configurações do grafo D3 force (defaults + serialização para query param ?d3c=).
 */

import { compressToParam, decompressFromParam } from "./compress.js";

/** @typedef {"drag" | "repulsion"} MouseMode */
/** @typedef {"large" | "small" | "medium"} NodeDisplayMode */

/**
 * @typedef {Object} D3ForceSettings
 * @property {number} linkDistance
 * @property {number} linkStrength
 * @property {number} chargeStrength
 * @property {number} centerStrength
 * @property {number} collisionRadius
 * @property {number} alphaDecay
 * @property {number} velocityDecay
 */

/**
 * @typedef {Object} D3Config
 * @property {boolean} physicsEnabled
 * @property {boolean} showPlayPause
 * @property {boolean} dragWhenPaused
 * @property {boolean} animateNodes
 * @property {number} animateSpeed
 * @property {number} animateConcurrent
 * @property {number} animateRootRadiusPct
 * @property {number} animateChildRadiusPct
 * @property {MouseMode} mouseMode
 * @property {NodeDisplayMode} nodeDisplay
 * @property {boolean} nodeSidebar
 * @property {boolean} autoLineWrap
 * @property {number} wrapMaxChars
 * @property {D3ForceSettings} force
 */

/** Defaults alinhados ao d3-force. */
export const DEFAULT_D3_FORCE = {
  linkDistance: 30,
  linkStrength: 1,
  chargeStrength: -30,
  centerStrength: 1,
  collisionRadius: 0,
  alphaDecay: 0.0228,
  velocityDecay: 0.4,
};

/** @type {D3Config} */
export const DEFAULT_D3_CONFIG = {
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

/**
 * @param {unknown} value
 * @param {number} fallback
 * @param {number} [min]
 * @param {number} [max]
 */
function num(value, fallback, min = -Infinity, max = Infinity) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * @param {Partial<D3Config> | null | undefined} partial
 * @returns {D3Config}
 */
export function normalizeD3Config(partial) {
  const input = partial && typeof partial === "object" ? partial : {};
  const forceIn =
    input.force && typeof input.force === "object" ? input.force : {};
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
      ? /** @type {MouseMode} */ (input.mouseMode)
      : DEFAULT_D3_CONFIG.mouseMode,
    nodeDisplay: NODE_DISPLAYS.has(input.nodeDisplay)
      ? /** @type {NodeDisplayMode} */ (input.nodeDisplay)
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

/**
 * @param {D3Config} config
 * @returns {string}
 */
export function serializeD3Config(config) {
  return JSON.stringify(normalizeD3Config(config));
}

/**
 * @param {string} json
 * @returns {D3Config}
 */
export function deserializeD3Config(json) {
  if (!json || !String(json).trim()) return normalizeD3Config(null);
  try {
    return normalizeD3Config(JSON.parse(String(json)));
  } catch {
    return normalizeD3Config(null);
  }
}

/**
 * @param {D3Config} config
 * @returns {Promise<string>}
 */
export async function compressD3Config(config) {
  return compressToParam(serializeD3Config(config));
}

/**
 * @param {string} param
 * @returns {Promise<D3Config>}
 */
export async function decompressD3Config(param) {
  if (!param) return normalizeD3Config(null);
  try {
    const json = await decompressFromParam(param);
    return deserializeD3Config(json);
  } catch {
    return normalizeD3Config(null);
  }
}

/**
 * @param {URLSearchParams} params
 * @returns {boolean}
 */
export function parseD3Param(params = new URLSearchParams()) {
  const raw = params.get("d3");
  if (raw == null || raw === "") return false;
  const value = String(raw).trim().toLowerCase();
  return value === "1" || value === "true" || value === "on" || value === "yes";
}
