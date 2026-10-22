export const neutralAdjustments = {
  brightness: 0,
  contrast: 0,
  hue: 0,
  saturation: 0,
};
export const adjustmentLimits = {
  brightness: 100,
  contrast: 100,
  hue: 180,
  saturation: 100,
};
export function validAdjustments(value) {
  return (
    value &&
    typeof value === "object" &&
    Object.keys(adjustmentLimits).every(
      (key) =>
        Number.isFinite(value[key]) &&
        Math.abs(value[key]) <= adjustmentLimits[key],
    )
  );
}
export const hasAdjustments = (value) =>
  value && Object.keys(neutralAdjustments).some((key) => value[key] !== 0);
export const adjustmentFilter = (v) =>
  `brightness(${1 + v.brightness / 100}) contrast(${1 + v.contrast / 100}) hue-rotate(${v.hue}deg) saturate(${1 + v.saturation / 100})`;
const clamp = (v) => Math.max(0, Math.min(255, v));

// CSS filter matrix fallback for WebViews without CanvasRenderingContext2D.filter.
export function adjustPixels(data, value) {
  const angle = (value.hue * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle),
    sat = 1 + value.saturation / 100;
  const hue = [
    0.213 + c * 0.787 - s * 0.213,
    0.715 - c * 0.715 - s * 0.715,
    0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143,
    0.715 + c * 0.285 + s * 0.14,
    0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787,
    0.715 - c * 0.715 + s * 0.715,
    0.072 + c * 0.928 + s * 0.072,
  ];
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++)
    lut[i] = clamp(
      (clamp(i * (1 + value.brightness / 100)) - 127.5) *
        (1 + value.contrast / 100) +
        127.5,
    );
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const r = lut[data[i]],
      g = lut[data[i + 1]],
      b = lut[data[i + 2]];
    const hr = clamp(hue[0] * r + hue[1] * g + hue[2] * b),
      hg = clamp(hue[3] * r + hue[4] * g + hue[5] * b),
      hb = clamp(hue[6] * r + hue[7] * g + hue[8] * b);
    const l = 0.213 * hr + 0.715 * hg + 0.072 * hb;
    data[i] = clamp(l + sat * (hr - l));
    data[i + 1] = clamp(l + sat * (hg - l));
    data[i + 2] = clamp(l + sat * (hb - l));
  }
  return data;
}
export const validHex = (value) =>
  typeof value === "string" && /^#[a-f\d]{6}$/i.test(value);
export function validPalettes(palettes, favorites = []) {
  return (
    Array.isArray(palettes) &&
    palettes.length <= 8 &&
    palettes.every(
      (p) =>
        p &&
        typeof p.id === "string" &&
        p.id.length < 100 &&
        typeof p.name === "string" &&
        p.name.length <= 50 &&
        Array.isArray(p.colors) &&
        p.colors.length <= 32 &&
        p.colors.every(validHex),
    ) &&
    new Set(palettes.map((p) => p.id)).size === palettes.length &&
    Array.isArray(favorites) &&
    favorites.length <= 64 &&
    favorites.every(validHex)
  );
}
export function extractColors(pixels, maximum = 8) {
  const bins = new Map();
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const key =
      (pixels[i] >> 4) * 256 + (pixels[i + 1] >> 4) * 16 + (pixels[i + 2] >> 4);
    const bin = bins.get(key) || { n: 0, rgb: [0, 0, 0] };
    bin.n++;
    for (let c = 0; c < 3; c++) bin.rgb[c] += pixels[i + c];
    bins.set(key, bin);
  }
  const candidates = [...bins.values()]
    .sort((a, b) => b.n - a.n)
    .map((b) => b.rgb.map((v) => Math.round(v / b.n)));
  const colors = [];
  for (const rgb of candidates) {
    if (
      colors.every(
        (other) =>
          rgb.reduce((sum, v, i) => sum + (v - other[i]) ** 2, 0) >= 28 ** 2,
      )
    )
      colors.push(rgb);
    if (colors.length === maximum) break;
  }
  return colors.map(
    (rgb) => "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join(""),
  );
}
