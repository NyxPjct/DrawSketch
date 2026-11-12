import {
  normalizeGuides,
  beginGuide,
  projectGuide,
  vanishingPoints,
} from "./guides-model.js";
import { getWorkspace, patchWorkspace } from "./storage.js";
export function initGuides(api) {
  const { $, state, t } = api,
    svg = $("guide-overlay");
  let config = normalizeGuides(),
    id = null,
    loading = false,
    exercise = null;
  const writes = new Map();
  let writing = false;
  async function save() {
    if (!id || loading) return;
    writes.set(id, { ...config });
    if (writing) return;
    writing = true;
    try {
      while (writes.size) {
        const [target, value] = writes.entries().next().value;
        writes.delete(target);
        try {
          await patchWorkspace(target, { guides: value });
        } catch {
          api.toast("guideSaveError");
        }
      }
    } finally {
      writing = false;
    }
  }
  function node(tag, attributes) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key, value] of Object.entries(attributes))
      el.setAttribute(key, value);
    el.setAttribute("vector-effect", "non-scaling-stroke");
    svg.append(el);
  }
  function render() {
    const w = state.width,
      h = state.height,
      g = config;
    svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    svg.replaceChildren();
    const line = (a, b) => node("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    if (g.grid > 1)
      for (let i = 1; i < g.grid; i++) {
        line({ x: (w * i) / g.grid, y: 0 }, { x: (w * i) / g.grid, y: h });
        line({ x: 0, y: (h * i) / g.grid }, { x: w, y: (h * i) / g.grid });
      }
    if (g.mode === "ruler") {
      const a = (g.angle * Math.PI) / 180,
        d = Math.hypot(w, h) * 2;
      line(
        { x: w * g.cx - Math.cos(a) * d, y: h * g.cy - Math.sin(a) * d },
        { x: w * g.cx + Math.cos(a) * d, y: h * g.cy + Math.sin(a) * d },
      );
    } else if (g.mode === "ellipse")
      node("ellipse", {
        cx: w * g.cx,
        cy: h * g.cy,
        rx: w * g.rx,
        ry: h * g.ry,
      });
    else if (g.mode.startsWith("perspective")) {
      line({ x: 0, y: h * g.horizon }, { x: w, y: h * g.horizon });
      for (const v of vanishingPoints(g, w, h)) {
        for (let i = 0; i <= 8; i++)
          for (const edge of [
            { x: (w * i) / 8, y: 0 },
            { x: (w * i) / 8, y: h },
            { x: 0, y: (h * i) / 8 },
            { x: w, y: (h * i) / 8 },
          ])
            line(v, edge);
        node("circle", { cx: v.x, cy: v.y, r: 6 });
      }
    }
    if (exercise === "lines")
      for (let i = 1; i <= 5; i++)
        line(
          { x: w * 0.15, y: (h * i) / 7 },
          { x: w * 0.85, y: (h * (i + 1)) / 7 },
        );
    if (exercise === "ellipses")
      for (let i = 1; i <= 3; i++)
        node("ellipse", {
          cx: (w * i) / 4,
          cy: h / 2,
          rx: w * 0.1,
          ry: h * (0.12 + i * 0.04),
        });
    if (exercise === "values")
      for (let i = 0; i < 5; i++)
        node("rect", {
          x: w * (0.1 + i * 0.16),
          y: h * 0.3,
          width: w * 0.14,
          height: h * 0.4,
        });
    svg.toggleAttribute("hidden", !svg.children.length);
  }
  function sync() {
    $("guide-mode").value = config.mode;
    $("guide-snap").checked = config.snap;
    $("guide-grid").value = config.grid;
    $("guide-grid-value").textContent = config.grid;
    $("guide-snap").disabled = config.mode === "off" || loading;
    for (const el of document.querySelectorAll("[data-guide]")) {
      el.value = config[el.dataset.guide];
      $(el.id + "-value").textContent =
        el.dataset.guide === "angle"
          ? config.angle + "°"
          : Math.round(Number(el.value) * 100) + "%";
      el.disabled = loading;
    }
    for (const el of document.querySelectorAll("[data-guide-modes]"))
      el.hidden = !el.dataset.guideModes.split(" ").includes(config.mode);
    $("view-mirror").checked = state.viewMirror === true;
    $("view-gray").checked = state.viewGray === true;
    render();
  }
  async function load(next) {
    if (next === id) {
      render();
      return;
    }
    id = next;
    loading = true;
    config = normalizeGuides();
    sync();
    try {
      const value = await getWorkspace(next);
      if (id !== next) return;
      config = normalizeGuides(value.guides);
    } catch {
      if (id === next) api.toast("guideSaveError");
    }
    if (id === next) {
      loading = false;
      sync();
    }
  }
  const change = () => {
    if (loading) return;
    const values = {
      ...config,
      mode: $("guide-mode").value,
      snap: $("guide-snap").checked,
      grid: Number($("guide-grid").value),
    };
    for (const el of document.querySelectorAll("[data-guide]"))
      values[el.dataset.guide] = Number(el.value);
    config = normalizeGuides(values);
    sync();
    save();
  };
  for (const el of document.querySelectorAll(
    "#guides-dialog input:not([data-view]), #guide-mode",
  ))
    el.addEventListener("input", change);
  $("guide-reset").addEventListener("click", () => {
    if (!loading) {
      config = normalizeGuides();
      sync();
      save();
    }
  });
  for (const [id, key] of [
    ["view-mirror", "viewMirror"],
    ["view-gray", "viewGray"],
  ])
    $(id).addEventListener("change", () => {
      state[key] = $(id).checked;
      $("drawing-canvas").style.filter = state.viewGray ? "grayscale(1)" : "";
      api.applyTransform();
    });
  function open() {
    sync();
    $("guides-dialog").showModal();
  }
  return {
    load,
    open,
    render,
    begin: (p) => beginGuide(config, state.width, state.height, p),
    project: (g, p) => projectGuide(g, p),
    setExercise: (value) => {
      exercise = value;
      render();
    },
    refreshLanguage: sync,
  };
}
