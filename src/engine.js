export const brushPresets = {
  pencil: { size: 4, opacity: 85 },
  ink: { size: 7, opacity: 100 },
  marker: { size: 32, opacity: 75 },
  watercolor: { size: 65, opacity: 35 },
  airbrush: { size: 100, opacity: 35 },
  charcoal: { size: 30, opacity: 80 },
  oil: { size: 28, opacity: 95 },
  pixel: { size: 10, opacity: 100 },
};
export const blendModes = ["source-over", "multiply", "screen", "overlay"];
export const MAX_LAYERS = 24;
export const MAX_PIXELS = 12_000_000;

function noise(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

export function withSymmetry(ctx, width, height, axis, draw) {
  draw();
  if (axis === "vertical" || axis === "both") {
    ctx.save();
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
    draw();
    ctx.restore();
  }
  if (axis === "horizontal" || axis === "both") {
    ctx.save();
    ctx.translate(0, height);
    ctx.scale(1, -1);
    draw();
    ctx.restore();
  }
  if (axis === "both") {
    ctx.save();
    ctx.translate(width, height);
    ctx.scale(-1, -1);
    draw();
    ctx.restore();
  }
}

export function brushSegment(ctx, from, to, config, dot = false) {
  const { brush, size, opacity, color, erasing } = config;
  const pressure = (from.pressure + to.pressure) / 2;
  const width = Math.max(
    0.3,
    size * (erasing || !config.pressure ? 1 : 0.4 + pressure * 0.9),
  );
  ctx.save();
  ctx.globalCompositeOperation = erasing ? "destination-out" : "source-over";
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineJoin = "round";
  ctx.lineCap = brush === "marker" && !erasing ? "square" : "round";
  ctx.lineWidth = width;
  const alpha = opacity / 100;
  ctx.globalAlpha = erasing
    ? 1
    : alpha * (brush === "pencil" ? 0.75 : brush === "watercolor" ? 0.22 : 1);
  if (brush === "watercolor" && !erasing) {
    ctx.shadowBlur = width * 0.3;
    ctx.shadowColor = color;
  }
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  if (!erasing && ["airbrush", "charcoal", "pixel"].includes(brush)) {
    const spacing =
      brush === "pixel" ? Math.max(1, width * 0.35) : Math.max(1, width * 0.15);
    const steps = Math.max(1, Math.ceil(distance / spacing));
    for (let i = 0; i <= steps; i++) {
      const x = from.x + ((to.x - from.x) * i) / steps,
        y = from.y + ((to.y - from.y) * i) / steps;
      if (brush === "pixel") {
        const grid = Math.max(1, Math.round(width));
        ctx.fillRect(
          Math.floor(x / grid) * grid,
          Math.floor(y / grid) * grid,
          grid,
          grid,
        );
      } else if (brush === "airbrush") {
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, width / 2);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, `${color}00`);
        ctx.fillStyle = gradient;
        ctx.globalAlpha = alpha * 0.15;
        ctx.fillRect(x - width / 2, y - width / 2, width, width);
      } else {
        ctx.globalAlpha = alpha * 0.45;
        const seed = x * 3.1 + y * 9.3;
        for (let grain = 0; grain < 30; grain++) {
          const angle = noise(seed + grain) * Math.PI * 2,
            radius = (Math.sqrt(noise(seed + grain + 40)) * width) / 2;
          ctx.fillRect(
            x + Math.cos(angle) * radius,
            y + Math.sin(angle) * radius,
            0.6 + noise(seed + grain + 80) * 1.5,
            0.6 + noise(seed + grain + 90) * 1.5,
          );
        }
      }
    }
  } else {
    ctx.beginPath();
    if (dot) {
      ctx.arc(to.x, to.y, width / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
    if (!erasing && brush === "oil" && !dot) {
      ctx.globalAlpha = alpha * 0.3;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = Math.max(0.5, width / 18);
      for (let i = -3; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(from.x + (i * width) / 9, from.y - width / 5);
        ctx.lineTo(to.x + (i * width) / 9, to.y - width / 5);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

export function drawShape(ctx, from, destination, config) {
  const to = { ...destination };
  if (config.constrain) {
    if (config.tool === "line") {
      const angle =
        (Math.round(Math.atan2(to.y - from.y, to.x - from.x) / (Math.PI / 4)) *
          Math.PI) /
        4;
      const distance = Math.hypot(to.x - from.x, to.y - from.y);
      to.x = from.x + Math.cos(angle) * distance;
      to.y = from.y + Math.sin(angle) * distance;
    } else {
      const side = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
      to.x = from.x + Math.sign(to.x - from.x || 1) * side;
      to.y = from.y + Math.sign(to.y - from.y || 1) * side;
    }
  }
  ctx.save();
  ctx.strokeStyle = config.color;
  ctx.fillStyle = config.color;
  ctx.lineWidth = config.size;
  ctx.globalAlpha = config.opacity / 100;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (config.tool === "line") {
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
  } else if (config.tool === "rectangle")
    ctx.rect(from.x, from.y, to.x - from.x, to.y - from.y);
  else
    ctx.ellipse(
      (from.x + to.x) / 2,
      (from.y + to.y) / 2,
      Math.abs(to.x - from.x) / 2,
      Math.abs(to.y - from.y) / 2,
      0,
      0,
      Math.PI * 2,
    );
  if (config.fill && config.tool !== "line") ctx.fill();
  else ctx.stroke();
  ctx.restore();
}

export function floodFill(ctx, width, height, start, config) {
  const x = Math.floor(start.x),
    y = Math.floor(start.y);
  if (x < 0 || y < 0 || x >= width || y >= height) return false;
  const image = ctx.getImageData(0, 0, width, height),
    pixels = image.data;
  const initial = (y * width + x) * 4,
    target = Array.from(pixels.subarray(initial, initial + 4));
  const rgb = config.color
    .match(/[a-f\d]{2}/gi)
    .map((part) => parseInt(part, 16));
  const replacement = [...rgb, Math.round(config.opacity * 2.55)];
  if (replacement.every((value, i) => Math.abs(value - target[i]) <= 2))
    return false;
  const visited = new Uint8Array(width * height),
    queue = new Int32Array(width * height);
  let tail = 0,
    head = 0;
  queue[tail++] = y * width + x;
  visited[queue[0]] = 1;
  const matches = (p) =>
    target.every(
      (value, i) => Math.abs(pixels[p * 4 + i] - value) <= config.tolerance,
    );
  while (head < tail) {
    const p = queue[head++];
    if (!matches(p)) continue;
    pixels.set(replacement, p * 4);
    const px = p % width;
    for (const n of [
      px > 0 ? p - 1 : -1,
      px < width - 1 ? p + 1 : -1,
      p - width,
      p + width,
    ]) {
      if (n >= 0 && n < visited.length && !visited[n]) {
        visited[n] = 1;
        queue[tail++] = n;
      }
    }
  }
  ctx.putImageData(image, 0, 0);
  return true;
}
