// Scanline flood fill. Shared with the worker and deterministic CPU tests.
export function fillPixels(pixels, width, height, start, config) {
  const x = Math.floor(start.x),
    y = Math.floor(start.y);
  if (x < 0 || y < 0 || x >= width || y >= height) return false;
  const initial = (y * width + x) * 4,
    target = Array.from(pixels.subarray(initial, initial + 4)),
    rgb = config.color.match(/[a-f\d]{2}/gi).map((part) => parseInt(part, 16));
  const replacement = [...rgb, Math.round(config.opacity * 2.55)],
    tolerance = config.tolerance;
  if (replacement.every((value, i) => Math.abs(value - target[i]) < 2))
    return false;
  const seen = new Uint8Array(width * height),
    stack = [y * width + x];
  const matches = (p) => {
    const i = p * 4;
    return (
      !seen[p] &&
      Math.abs(pixels[i] - target[0]) <= tolerance &&
      Math.abs(pixels[i + 1] - target[1]) <= tolerance &&
      Math.abs(pixels[i + 2] - target[2]) <= tolerance &&
      Math.abs(pixels[i + 3] - target[3]) <= tolerance
    );
  };
  while (stack.length) {
    let seed = stack.pop();
    if (!matches(seed)) continue;
    let left = seed;
    while (left % width > 0 && matches(left - 1)) left--;
    let above = false,
      below = false;
    for (
      let p = left;
      p < width * height &&
      Math.floor(p / width) === Math.floor(left / width) &&
      matches(p);
      p++
    ) {
      seen[p] = 1;
      pixels.set(replacement, p * 4);
      const up = p - width,
        down = p + width,
        hasAbove = up >= 0 && matches(up),
        hasBelow = down < width * height && matches(down);
      if (hasAbove && !above) stack.push(up);
      if (hasBelow && !below) stack.push(down);
      above = hasAbove;
      below = hasBelow;
    }
  }
  return true;
}
