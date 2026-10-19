export const categories = ["sketch", "ink", "paint", "custom"];
export const defaultCurve = [0, 0.25, 0.5, 0.75, 1];
export const brushCategories = {
  pencil: "sketch",
  charcoal: "sketch",
  ink: "ink",
  marker: "ink",
  watercolor: "paint",
  airbrush: "paint",
  oil: "paint",
  pixel: "ink",
};
export function validCurve(curve) {
  return (
    Array.isArray(curve) &&
    curve.length === 5 &&
    curve[0] === 0 &&
    curve[4] === 1 &&
    curve.every(
      (v, i) =>
        Number.isFinite(v) && v >= 0 && v <= 1 && (!i || v >= curve[i - 1]),
    )
  );
}
export function pressureResponse(value, curve = defaultCurve) {
  const p = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5));
  const position = p * 4,
    index = Math.min(3, Math.floor(position));
  return curve[index] + (curve[index + 1] - curve[index]) * (position - index);
}
export function normalizePreset(item, brushPresets) {
  if (
    !item ||
    typeof item.name !== "string" ||
    !item.name.trim() ||
    item.name.length > 50 ||
    !Object.hasOwn(brushPresets, item.brush) ||
    !Number.isFinite(item.size) ||
    item.size < 1 ||
    item.size > 160 ||
    !Number.isFinite(item.opacity) ||
    item.opacity < 1 ||
    item.opacity > 100 ||
    (item.pressureCurve !== undefined && !validCurve(item.pressureCurve))
  )
    throw new Error("Invalid brush preset");
  const bounded = (v, max, fallback) =>
    Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : fallback;
  return {
    id: crypto.randomUUID(),
    name: item.name.trim(),
    brush: item.brush,
    category: categories.includes(item.category) ? item.category : "custom",
    size: item.size,
    opacity: item.opacity,
    texture: ["none", "grain", "canvas"].includes(item.texture)
      ? item.texture
      : "none",
    textureStrength: bounded(item.textureStrength, 100, 35),
    colorMix: bounded(item.colorMix, 100, 0),
    stabilization: bounded(item.stabilization, 80, 0),
    tilt: item.tilt !== false,
    pressure: item.pressure !== false,
    pressureCurve: [...(item.pressureCurve || defaultCurve)],
  };
}
export function parseBrushLibrary(value, presets) {
  if (
    value?.format !== "drawsketch-brushes" ||
    value.version !== 1 ||
    !Array.isArray(value.brushes) ||
    !value.brushes.length ||
    value.brushes.length > 32
  )
    throw new Error("Invalid brush library");
  return value.brushes.map((item) => normalizePreset(item, presets));
}
