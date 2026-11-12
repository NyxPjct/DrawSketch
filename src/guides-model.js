export const guideDefaults = {
  mode: "off",
  snap: false,
  angle: 0,
  cx: 0.5,
  cy: 0.5,
  rx: 0.3,
  ry: 0.2,
  horizon: 0.4,
  spread: 0.8,
  vertical: -0.5,
  grid: 0,
};
export function normalizeGuides(value = {}) {
  if (!value || typeof value !== "object") value = {};
  const result = { ...guideDefaults };
  if (
    [
      "off",
      "ruler",
      "ellipse",
      "perspective1",
      "perspective2",
      "perspective3",
    ].includes(value.mode)
  )
    result.mode = value.mode;
  result.snap = value.snap === true;
  for (const [key, min, max] of [
    ["angle", -180, 180],
    ["cx", 0, 1],
    ["cy", 0, 1],
    ["rx", 0.05, 0.5],
    ["ry", 0.05, 0.5],
    ["horizon", 0, 1],
    ["spread", 0.1, 2],
    ["vertical", -2, 2],
    ["grid", 0, 12],
  ])
    if (Number.isFinite(value[key]))
      result[key] = Math.max(min, Math.min(max, value[key]));
  result.grid = Math.round(result.grid);
  return result;
}
export function vanishingPoints(g, width, height) {
  if (g.mode === "perspective1")
    return [{ x: width * g.cx, y: height * g.horizon }];
  const points = [
    { x: width * (g.cx - g.spread / 2), y: height * g.horizon },
    { x: width * (g.cx + g.spread / 2), y: height * g.horizon },
  ];
  if (g.mode === "perspective3")
    points.push({ x: width * g.cx, y: height * g.vertical });
  return points;
}
const projectLine = (p, origin, direction) => {
  const d = direction.x ** 2 + direction.y ** 2;
  if (d < 1e-10) return { ...p };
  const t =
    ((p.x - origin.x) * direction.x + (p.y - origin.y) * direction.y) / d;
  return { ...p, x: origin.x + direction.x * t, y: origin.y + direction.y * t };
};
export function beginGuide(g, width, height, point) {
  if (!g.snap || g.mode === "off") return null;
  const guide = {
    g: { ...g },
    width,
    height,
    origin: { ...point },
    direction: null,
  };
  guide.start = projectGuide(guide, point);
  return guide;
}
export function projectGuide(guide, p) {
  if (!guide) return p;
  const { g, width, height, origin } = guide;
  const center = { x: width * g.cx, y: height * g.cy };
  if (g.mode === "ellipse") {
    const a = Math.atan2(
      (p.y - center.y) / (height * g.ry),
      (p.x - center.x) / (width * g.rx),
    );
    return {
      ...p,
      x: center.x + width * g.rx * Math.cos(a),
      y: center.y + height * g.ry * Math.sin(a),
    };
  }
  if (g.mode === "ruler")
    return projectLine(p, center, {
      x: Math.cos((g.angle * Math.PI) / 180),
      y: Math.sin((g.angle * Math.PI) / 180),
    });
  const move = { x: p.x - origin.x, y: p.y - origin.y };
  if (!guide.direction && Math.hypot(move.x, move.y) >= 2) {
    const candidates = vanishingPoints(g, width, height).map((v) => ({
      x: v.x - origin.x,
      y: v.y - origin.y,
    }));
    if (g.mode !== "perspective3") candidates.push({ x: 0, y: 1 });
    if (g.mode === "perspective1") candidates.push({ x: 1, y: 0 });
    guide.direction = candidates
      .filter((v) => Math.hypot(v.x, v.y) > 1e-6)
      .sort(
        (a, b) =>
          Math.abs(move.x * b.x + move.y * b.y) / Math.hypot(b.x, b.y) -
          Math.abs(move.x * a.x + move.y * a.y) / Math.hypot(a.x, a.y),
      )[0];
  }
  return guide.direction
    ? projectLine(p, origin, guide.direction)
    : { ...p, x: origin.x, y: origin.y };
}
