/**
 * Dialog de configuração D3 force (editor).
 */

import { DEFAULT_D3_CONFIG, normalizeD3Config } from "./d3-config.js";

/**
 * @param {HTMLElement} dialog
 * @param {(config: import('./d3-config.js').D3Config) => void} onApply
 */
export function bindD3ConfigDialog(dialog, onApply) {
  if (!dialog) return;

  const form = dialog.querySelector("form");
  const fields = {
    physicsEnabled: /** @type {HTMLInputElement | null} */ (
      dialog.querySelector("#d3-physics-enabled")
    ),
    showPlayPause: /** @type {HTMLInputElement | null} */ (
      dialog.querySelector("#d3-show-playpause")
    ),
    dragWhenPaused: /** @type {HTMLInputElement | null} */ (
      dialog.querySelector("#d3-drag-when-paused")
    ),
    mouseMode: /** @type {NodeListOf<HTMLInputElement>} */ (
      dialog.querySelectorAll('input[name="d3-mouse-mode"]')
    ),
    nodeDisplay: /** @type {NodeListOf<HTMLInputElement>} */ (
      dialog.querySelectorAll('input[name="d3-node-display"]')
    ),
    nodeSidebar: /** @type {HTMLInputElement | null} */ (
      dialog.querySelector("#d3-node-sidebar")
    ),
    autoLineWrap: /** @type {HTMLInputElement | null} */ (
      dialog.querySelector("#d3-auto-line-wrap")
    ),
    animateNodes: /** @type {HTMLInputElement | null} */ (
      dialog.querySelector("#d3-animate-nodes")
    ),
    animateOptions: /** @type {HTMLElement | null} */ (
      dialog.querySelector("#d3-animate-options")
    ),
    animateSpeed: /** @type {HTMLInputElement | null} */ (
      dialog.querySelector("#d3-animate-speed")
    ),
    animateConcurrent: /** @type {HTMLInputElement | null} */ (
      dialog.querySelector("#d3-animate-concurrent")
    ),
    animateRootRadiusPct: /** @type {HTMLInputElement | null} */ (
      dialog.querySelector("#d3-animate-root-radius")
    ),
    animateChildRadiusPct: /** @type {HTMLInputElement | null} */ (
      dialog.querySelector("#d3-animate-child-radius")
    ),
    linkDistance: /** @type {HTMLInputElement | null} */ (
      dialog.querySelector("#d3-link-distance")
    ),
    linkStrength: /** @type {HTMLInputElement | null} */ (
      dialog.querySelector("#d3-link-strength")
    ),
    chargeStrength: /** @type {HTMLInputElement | null} */ (
      dialog.querySelector("#d3-charge-strength")
    ),
    centerStrength: /** @type {HTMLInputElement | null} */ (
      dialog.querySelector("#d3-center-strength")
    ),
    collisionRadius: /** @type {HTMLInputElement | null} */ (
      dialog.querySelector("#d3-collision-radius")
    ),
    alphaDecay: /** @type {HTMLInputElement | null} */ (
      dialog.querySelector("#d3-alpha-decay")
    ),
    velocityDecay: /** @type {HTMLInputElement | null} */ (
      dialog.querySelector("#d3-velocity-decay")
    ),
  };

  const valueLabels = {
    linkDistance: dialog.querySelector("#d3-link-distance-val"),
    linkStrength: dialog.querySelector("#d3-link-strength-val"),
    chargeStrength: dialog.querySelector("#d3-charge-strength-val"),
    centerStrength: dialog.querySelector("#d3-center-strength-val"),
    collisionRadius: dialog.querySelector("#d3-collision-radius-val"),
    alphaDecay: dialog.querySelector("#d3-alpha-decay-val"),
    velocityDecay: dialog.querySelector("#d3-velocity-decay-val"),
    animateSpeed: dialog.querySelector("#d3-animate-speed-val"),
    animateConcurrent: dialog.querySelector("#d3-animate-concurrent-val"),
    animateRootRadiusPct: dialog.querySelector("#d3-animate-root-radius-val"),
    animateChildRadiusPct: dialog.querySelector("#d3-animate-child-radius-val"),
  };

  /** @type {import('./d3-config.js').D3Config} */
  let current = normalizeD3Config(null);

  function syncSlider(input, labelEl) {
    if (!input || !labelEl) return;
    labelEl.textContent = input.value;
  }

  function bindSlider(input, labelEl) {
    if (!input) return;
    input.addEventListener("input", () => syncSlider(input, labelEl));
  }

  bindSlider(fields.linkDistance, valueLabels.linkDistance);
  bindSlider(fields.linkStrength, valueLabels.linkStrength);
  bindSlider(fields.chargeStrength, valueLabels.chargeStrength);
  bindSlider(fields.centerStrength, valueLabels.centerStrength);
  bindSlider(fields.collisionRadius, valueLabels.collisionRadius);
  bindSlider(fields.alphaDecay, valueLabels.alphaDecay);
  bindSlider(fields.velocityDecay, valueLabels.velocityDecay);
  bindSlider(fields.animateSpeed, valueLabels.animateSpeed);
  bindSlider(fields.animateConcurrent, valueLabels.animateConcurrent);
  bindSlider(fields.animateRootRadiusPct, valueLabels.animateRootRadiusPct);
  bindSlider(fields.animateChildRadiusPct, valueLabels.animateChildRadiusPct);

  function syncAnimateOptionsVisibility() {
    if (!fields.animateOptions) return;
    fields.animateOptions.hidden = !fields.animateNodes?.checked;
  }

  fields.animateNodes?.addEventListener("change", syncAnimateOptionsVisibility);

  function readForm() {
    const mouseMode =
      [...fields.mouseMode].find((el) => el.checked)?.value ||
      DEFAULT_D3_CONFIG.mouseMode;
    const nodeDisplay =
      [...fields.nodeDisplay].find((el) => el.checked)?.value ||
      DEFAULT_D3_CONFIG.nodeDisplay;

    return normalizeD3Config({
      physicsEnabled: Boolean(fields.physicsEnabled?.checked),
      showPlayPause: Boolean(fields.showPlayPause?.checked),
      dragWhenPaused: Boolean(fields.dragWhenPaused?.checked),
      mouseMode,
      nodeDisplay,
      nodeSidebar: Boolean(fields.nodeSidebar?.checked),
      autoLineWrap: Boolean(fields.autoLineWrap?.checked),
      animateNodes: Boolean(fields.animateNodes?.checked),
      animateSpeed: Number(fields.animateSpeed?.value),
      animateConcurrent: Number(fields.animateConcurrent?.value),
      animateRootRadiusPct: Number(fields.animateRootRadiusPct?.value),
      animateChildRadiusPct: Number(fields.animateChildRadiusPct?.value),
      force: {
        linkDistance: Number(fields.linkDistance?.value),
        linkStrength: Number(fields.linkStrength?.value),
        chargeStrength: Number(fields.chargeStrength?.value),
        centerStrength: Number(fields.centerStrength?.value),
        collisionRadius: Number(fields.collisionRadius?.value),
        alphaDecay: Number(fields.alphaDecay?.value),
        velocityDecay: Number(fields.velocityDecay?.value),
      },
    });
  }

  function fillForm(config) {
    current = normalizeD3Config(config);
    if (fields.physicsEnabled) fields.physicsEnabled.checked = current.physicsEnabled;
    if (fields.showPlayPause) fields.showPlayPause.checked = current.showPlayPause;
    if (fields.dragWhenPaused) fields.dragWhenPaused.checked = current.dragWhenPaused;
    for (const el of fields.mouseMode) {
      el.checked = el.value === current.mouseMode;
    }
    for (const el of fields.nodeDisplay) {
      el.checked = el.value === current.nodeDisplay;
    }
    if (fields.nodeSidebar) fields.nodeSidebar.checked = current.nodeSidebar;
    if (fields.autoLineWrap) fields.autoLineWrap.checked = current.autoLineWrap;
    if (fields.animateNodes) fields.animateNodes.checked = current.animateNodes;
    if (fields.animateSpeed) fields.animateSpeed.value = String(current.animateSpeed);
    if (fields.animateConcurrent) {
      fields.animateConcurrent.value = String(current.animateConcurrent);
    }
    if (fields.animateRootRadiusPct) {
      fields.animateRootRadiusPct.value = String(current.animateRootRadiusPct);
    }
    if (fields.animateChildRadiusPct) {
      fields.animateChildRadiusPct.value = String(current.animateChildRadiusPct);
    }
    syncAnimateOptionsVisibility();

    const f = current.force;
    if (fields.linkDistance) fields.linkDistance.value = String(f.linkDistance);
    if (fields.linkStrength) fields.linkStrength.value = String(f.linkStrength);
    if (fields.chargeStrength) fields.chargeStrength.value = String(f.chargeStrength);
    if (fields.centerStrength) fields.centerStrength.value = String(f.centerStrength);
    if (fields.collisionRadius) fields.collisionRadius.value = String(f.collisionRadius);
    if (fields.alphaDecay) fields.alphaDecay.value = String(f.alphaDecay);
    if (fields.velocityDecay) fields.velocityDecay.value = String(f.velocityDecay);

    for (const [key, labelEl] of Object.entries(valueLabels)) {
      const input = fields[key];
      if (input && labelEl) syncSlider(input, labelEl);
    }
  }

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    current = readForm();
    onApply(current);
    dialog.close();
  });

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  dialog.querySelector(".d3-config-reset")?.addEventListener("click", () => {
    fillForm(DEFAULT_D3_CONFIG);
  });

  return {
    open(config) {
      fillForm(config);
      if (typeof dialog.showModal === "function") dialog.showModal();
    },
    getConfig() {
      return normalizeD3Config(current);
    },
    setConfig(config) {
      current = normalizeD3Config(config);
    },
  };
}
