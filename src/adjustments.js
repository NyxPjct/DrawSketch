import { neutralAdjustments } from "./color-model.js";
export function initAdjustments(api) {
  const { $, state } = api;
  let layer = null,
    preview = null,
    frame;
  function sync() {
    for (const key of Object.keys(neutralAdjustments)) {
      $("adjust-" + key).value = preview?.adjustments[key] || 0;
      $("adjust-" + key + "-value").textContent =
        `${preview?.adjustments[key] || 0}${key === "hue" ? "°" : "%"}`;
    }
  }
  function cancel() {
    if (frame) {
      cancelAnimationFrame(frame);
      frame = null;
    }
    state.adjustmentPreview = null;
    preview = null;
    layer = null;
    api.render();
  }
  function open() {
    if (!api.canEdit()) return;
    const current = api.activeLayer();
    if (!current || current.locked) return api.toast("errorLayer");
    layer = current;
    preview = {
      ...current,
      adjustments: { ...current.adjustments },
      _adjusted: null,
      _adjustSignature: null,
      _masked: null,
      _maskSignature: null,
    };
    state.adjustmentPreview = { layerId: current.id, layer: preview };
    sync();
    $("adjust-layer-name").textContent = api.nameOf(current);
    $("adjustments-dialog").showModal();
  }
  for (const key of Object.keys(neutralAdjustments))
    $("adjust-" + key).addEventListener("input", () => {
      if (!preview) return;
      preview.adjustments[key] = Number($("adjust-" + key).value);
      sync();
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = null;
          api.render();
        });
    });
  $("adjust-reset").addEventListener("click", () => {
    if (preview) {
      preview.adjustments = { ...neutralAdjustments };
      sync();
      api.render();
    }
  });
  $("adjust-apply").addEventListener("click", () => {
    if (!layer || !preview || !state.layers.includes(layer)) return;
    if (frame) {
      cancelAnimationFrame(frame);
      frame = null;
    }
    layer.adjustments = { ...preview.adjustments };
    state.adjustmentPreview = null;
    preview = null;
    layer = null;
    api.commit();
    $("adjustments-dialog").close();
  });
  $("adjust-cancel").addEventListener("click", cancel);
  $("adjustments-dialog").addEventListener("close", cancel);
  return { open };
}
