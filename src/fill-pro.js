// Binary morphology is separable and linear in the number of pixels.
export function normalizeFill(value = {}) {
  if (!value || typeof value !== "object") value = {};
  return {
    reference: value.reference === "visible" ? "visible" : "active",
    gap: Number.isFinite(value.gap)
      ? Math.max(0, Math.min(8, Math.round(value.gap)))
      : 0,
    expand: Number.isFinite(value.expand)
      ? Math.max(0, Math.min(12, Math.round(value.expand)))
      : 0,
  };
}
function pass(input, width, height, radius, horizontal, dilate) {
  const output = new Uint8Array(input.length);
  const outer = horizontal ? height : width,
    inner = horizontal ? width : height;
  const index = (a, b) => (horizontal ? a * width + b : b * width + a);
  for (let a = 0; a < outer; a++) {
    let count = 0;
    for (let b = 0; b <= Math.min(inner - 1, radius); b++)
      count += input[index(a, b)];
    for (let b = 0; b < inner; b++) {
      output[index(a, b)] = dilate
        ? Number(count > 0)
        : Number(count === radius * 2 + 1);
      if (b - radius >= 0) count -= input[index(a, b - radius)];
      if (b + radius + 1 < inner) count += input[index(a, b + radius + 1)];
    }
  }
  return output;
}
export function morphology(mask, width, height, radius, dilate) {
  if (!radius) return mask;
  return pass(
    pass(mask, width, height, radius, true, dilate),
    width,
    height,
    radius,
    false,
    dilate,
  );
}
export function professionalFill(
  pixels,
  reference,
  width,
  height,
  start,
  config,
) {
  const x = Math.floor(start.x),
    y = Math.floor(start.y),
    size = width * height;
  if (x < 0 || y < 0 || x >= width || y >= height) return false;
  const seed = y * width + x,
    offset = seed * 4;
  const target = reference.slice(offset, offset + 4);
  let barriers = new Uint8Array(size);
  for (let p = 0; p < size; p++) {
    const i = p * 4;
    barriers[p] = Number(
      Math.abs(reference[i] - target[0]) > config.tolerance ||
        Math.abs(reference[i + 1] - target[1]) > config.tolerance ||
        Math.abs(reference[i + 2] - target[2]) > config.tolerance ||
        Math.abs(reference[i + 3] - target[3]) > config.tolerance,
    );
  }
  const gap = Math.max(0, Math.min(8, Math.round(config.gap || 0)));
  if (gap)
    barriers = morphology(
      morphology(barriers, width, height, gap, true),
      width,
      height,
      gap,
      false,
    );
  if (barriers[seed]) return false;
  let region = new Uint8Array(size);
  const stack = [seed];
  const matches = (p) => !barriers[p] && !region[p];
  while (stack.length) {
    let p = stack.pop();
    if (!matches(p)) continue;
    while (p % width > 0 && matches(p - 1)) p--;
    const rowEnd = Math.floor(p / width) * width + width;
    let above = false,
      below = false;
    for (; p < rowEnd && matches(p); p++) {
      region[p] = 1;
      const up = p >= width && matches(p - width),
        down = p + width < size && matches(p + width);
      if (up && !above) stack.push(p - width);
      if (down && !below) stack.push(p + width);
      above = up;
      below = down;
    }
  }
  const expand = Math.max(0, Math.min(12, Math.round(config.expand || 0)));
  if (expand) region = morphology(region, width, height, expand, true);
  const rgba = [
    ...config.color.match(/[a-f\d]{2}/gi).map((v) => parseInt(v, 16)),
    Math.round(config.opacity * 2.55),
  ];
  let changed = false;
  for (let p = 0; p < size; p++)
    if (region[p]) {
      const i = p * 4;
      if (
        rgba[0] !== pixels[i] ||
        rgba[1] !== pixels[i + 1] ||
        rgba[2] !== pixels[i + 2] ||
        rgba[3] !== pixels[i + 3]
      ) {
        pixels.set(rgba, i);
        changed = true;
      }
    }
  return changed;
}
