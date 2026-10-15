import "./style.css";
import {
  t,
  setLanguage,
  getLanguage,
  applyTranslations,
  messages,
} from "./i18n.js";
import { saveDocument, getDocument, listDocuments } from "./storage.js";
import {
  brushPresets,
  blendModes,
  MAX_LAYERS,
  MAX_PIXELS,
  brushSegment,
  drawShape,
  floodFill,
  withSymmetry,
} from "./engine.js";
import { paintDemo } from "./demo.js";

const $ = (id) => document.getElementById(id);
const canvas = $("drawing-canvas");
const context = canvas.getContext("2d", { willReadFrequently: true });
const viewport = $("canvas-viewport");
const SETTINGS_KEY = "drawsketch.settings.v2";
const LAST_KEY = "drawsketch.last-document";
const RECOVERY_KEY = "drawsketch.recovery.v2";
const legacyKey = "drawsketch.document.v1";
const safeRead = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const safeWrite = (key, value) => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};
let savedSettings = {};
try {
  savedSettings = JSON.parse(safeRead(SETTINGS_KEY) || "{}") || {};
} catch {}
const settings = {
  language: Object.hasOwn(messages, savedSettings.language)
    ? savedSettings.language
    : "en",
  theme: ["dark", "light", "system"].includes(savedSettings.theme)
    ? savedSettings.theme
    : "dark",
  pressure: savedSettings.pressure !== false,
  finger: savedSettings.finger !== false,
  stabilization: Number.isFinite(savedSettings.stabilization)
    ? Math.max(0, Math.min(80, savedSettings.stabilization))
    : 0,
  tolerance: Number.isFinite(savedSettings.tolerance)
    ? Math.max(0, Math.min(80, savedSettings.tolerance))
    : 24,
};
setLanguage(settings.language);
const portrait = innerWidth < 600;
const state = {
  id: crypto.randomUUID(),
  width: portrait ? 900 : 1200,
  height: portrait ? 1200 : 800,
  title: "",
  titleKey: "demoTitle",
  background: "white",
  layers: [],
  activeId: null,
  tool: "brush",
  brush: "pencil",
  size: 4,
  opacity: 85,
  color: "#285b4e",
  zoom: 1,
  panX: 0,
  panY: 0,
  rotation: 0,
  hue: 160,
  saturation: 0.56,
  value: 0.36,
  symmetry: "off",
  shapeFill: false,
  focus: false,
  history: [],
  historyIndex: -1,
  drawing: null,
  gesture: null,
  busy: true,
  space: false,
  penActive: false,
  revision: 0,
};
let savedRevision = -1;
let saveTimer, toastTimer, frame;
let saveQueue = Promise.resolve();
let currentToast = null;
let saveStatusKey = "saving";
let installPrompt = null;
const touches = new Map();
const swatches = [
  "#285B4E",
  "#789274",
  "#B8C5A0",
  "#E5D9BE",
  "#D5B48E",
  "#BA795D",
  "#D85E6A",
  "#F1A283",
  "#26362E",
  "#405D7C",
  "#737DA1",
  "#AC92AC",
  "#C5AFFF",
  "#E2BF6B",
  "#F7ECD5",
  "#FFFFFF",
];
const nameKeys = new Set(["layerDefault", "demoWash", "demoLines"]);
const titleKeys = new Set(["untitled", "demoTitle"]);
const titleOf = () => (state.titleKey ? t(state.titleKey) : state.title);
const nameOf = (layer) =>
  layer.nameKey ? t(layer.nameKey, layer.nameParams) : layer.name;
const layerContext = (layer = activeLayer()) =>
  layer.canvas.getContext("2d", { willReadFrequently: true });
const activeLayer = () =>
  state.layers.find((layer) => layer.id === state.activeId);
const canEdit = () => !state.busy && !state.drawing && !state.gesture;

function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#i-${name}`);
  svg.append(use);
  return svg;
}
function toast(key, params = {}) {
  currentToast = { key, params };
  clearTimeout(toastTimer);
  $("toast").textContent = t(key, params);
  $("toast").hidden = false;
  toastTimer = setTimeout(() => {
    $("toast").hidden = true;
    currentToast = null;
  }, 4800);
}
function setSaveStatus(key) {
  saveStatusKey = key;
  $("save-status").replaceChildren();
  if (key === "saved") {
    const dot = document.createElement("span");
    dot.className = "status-dot";
    $("save-status").append(dot);
  }
  $("save-status").append(t(key));
}
function makeLayer(
  name = "",
  nameKey = "",
  nameParams = {},
  width = state.width,
  height = state.height,
) {
  const surface = document.createElement("canvas");
  surface.width = width;
  surface.height = height;
  return {
    id: crypto.randomUUID(),
    name,
    nameKey,
    nameParams,
    visible: true,
    locked: false,
    opacity: 1,
    blend: "source-over",
    canvas: surface,
  };
}
function composite(target, background = state.background) {
  target.clearRect(0, 0, state.width, state.height);
  if (background !== "transparent") {
    target.fillStyle = background === "warm" ? "#f6efdf" : "#ffffff";
    target.fillRect(0, 0, state.width, state.height);
  }
  for (const layer of state.layers) {
    if (!layer.visible) continue;
    target.globalAlpha = layer.opacity;
    target.globalCompositeOperation = layer.blend;
    target.drawImage(layer.canvas, 0, 0);
  }
  target.globalAlpha = 1;
  target.globalCompositeOperation = "source-over";
}
function render() {
  if (frame) {
    cancelAnimationFrame(frame);
    frame = null;
  }
  composite(context);
}
function requestRender() {
  if (!frame)
    frame = requestAnimationFrame(() => {
      frame = null;
      render();
    });
}
function syncTitle() {
  $("document-name").value = titleOf();
  $("canvas-caption").textContent = titleOf().toLocaleUpperCase(getLanguage());
  document.title = `${titleOf()} — DrawSketch`;
}
function syncDocument() {
  canvas.width = state.width;
  canvas.height = state.height;
  $("canvas-shell").style.width = `${state.width}px`;
  $("canvas-shell").style.height = `${state.height}px`;
  $("canvas-dimensions").textContent = `${state.width} × ${state.height} px`;
  $("canvas-background").value = state.background;
  syncTitle();
  render();
  renderLayers();
}
function snapshot() {
  return {
    format: "drawsketch",
    version: 2,
    id: state.id,
    width: state.width,
    height: state.height,
    title: titleOf(),
    titleKey: state.titleKey,
    background: state.background,
    activeId: state.activeId,
    layers: state.layers.map(
      ({
        id,
        name,
        nameKey,
        nameParams,
        visible,
        locked,
        opacity,
        blend,
        canvas: surface,
      }) => ({
        id,
        name: nameKey ? t(nameKey, nameParams) : name,
        nameKey,
        nameParams,
        visible,
        locked,
        opacity,
        blend,
        image: surface.toDataURL("image/png"),
      }),
    ),
  };
}
function updateHistoryButtons() {
  $("undo").disabled = state.busy || state.historyIndex <= 0;
  $("redo").disabled =
    state.busy || state.historyIndex >= state.history.length - 1;
}
function scheduleSave() {
  clearTimeout(saveTimer);
  setSaveStatus("saving");
  saveTimer = setTimeout(() => saveLocal(), 400);
}
async function saveLocal() {
  clearTimeout(saveTimer);
  if (!state.layers.length || state.drawing || state.gesture) return false;
  if (savedRevision === state.revision) return true;
  const data = snapshot(),
    revision = state.revision,
    id = state.id;
  const thumbnail = document.createElement("canvas");
  thumbnail.width = 360;
  thumbnail.height = Math.round((360 * state.height) / state.width);
  thumbnail
    .getContext("2d")
    .drawImage(canvas, 0, 0, thumbnail.width, thumbnail.height);
  const record = {
    id,
    title: titleOf(),
    updatedAt: Date.now(),
    thumbnail: thumbnail.toDataURL("image/webp", 0.8),
    data,
  };
  const operation = saveQueue.then(() => saveDocument(record));
  saveQueue = operation.catch(() => {});
  try {
    await operation;
    if (state.id === id && state.revision === revision) {
      savedRevision = revision;
      safeWrite(LAST_KEY, id);
      setSaveStatus("saved");
      try {
        localStorage.removeItem(RECOVERY_KEY);
      } catch {}
    }
    return true;
  } catch {
    setSaveStatus("saveFallback");
    toast("errorSave");
    return false;
  }
}
function commit() {
  state.revision++;
  state.history.splice(state.historyIndex + 1);
  state.history.push(snapshot());
  const limit = Math.min(
    40,
    Math.max(
      2,
      Math.floor(
        128_000_000 /
          (state.width * state.height * 4 * Math.max(1, state.layers.length)),
      ),
    ),
  );
  if (state.history.length > limit)
    state.history.splice(0, state.history.length - limit);
  state.historyIndex = state.history.length - 1;
  render();
  renderLayers();
  updateHistoryButtons();
  scheduleSave();
}
function validProject(data) {
  return (
    data?.format === "drawsketch" &&
    [1, 2].includes(data.version) &&
    Number.isInteger(data.width) &&
    Number.isInteger(data.height) &&
    data.width >= 64 &&
    data.height >= 64 &&
    data.width <= 4096 &&
    data.height <= 4096 &&
    data.width * data.height <= MAX_PIXELS &&
    typeof data.title === "string" &&
    Array.isArray(data.layers) &&
    data.layers.length > 0 &&
    data.layers.length <= MAX_LAYERS &&
    data.layers.every(
      (layer) =>
        typeof layer.name === "string" &&
        typeof layer.id === "string" &&
        layer.id.length < 100 &&
        typeof layer.visible === "boolean" &&
        Number.isFinite(layer.opacity) &&
        layer.opacity >= 0 &&
        layer.opacity <= 1 &&
        typeof layer.image === "string" &&
        layer.image.startsWith("data:image/png;base64,"),
    )
  );
}
async function restore(data) {
  if (!validProject(data)) throw new Error("Invalid project");
  const layers = [];
  for (const entry of data.layers) {
    const image = new Image();
    image.src = entry.image;
    await image.decode();
    if (
      image.naturalWidth !== data.width ||
      image.naturalHeight !== data.height
    )
      throw new Error("Invalid layer dimensions");
    const key = nameKeys.has(entry.nameKey) ? entry.nameKey : "";
    const params = {
      n: Number.isInteger(entry.nameParams?.n)
        ? Math.max(1, Math.min(10000, entry.nameParams.n))
        : layers.length + 1,
    };
    const layer = makeLayer(
      entry.name.slice(0, 80),
      key,
      params,
      data.width,
      data.height,
    );
    layer.id = entry.id;
    layer.visible = entry.visible;
    layer.opacity = entry.opacity;
    layer.locked = entry.locked === true;
    layer.blend = blendModes.includes(entry.blend)
      ? entry.blend
      : "source-over";
    layerContext(layer).drawImage(image, 0, 0);
    layers.push(layer);
  }
  if (new Set(layers.map((layer) => layer.id)).size !== layers.length)
    throw new Error("Duplicate layer identifiers");
  state.id =
    typeof data.id === "string" && data.id.length < 100
      ? data.id
      : crypto.randomUUID();
  state.width = data.width;
  state.height = data.height;
  state.title = data.title.slice(0, 80) || t("untitled");
  state.titleKey = titleKeys.has(data.titleKey) ? data.titleKey : "";
  state.background = ["white", "warm", "transparent"].includes(data.background)
    ? data.background
    : "white";
  state.layers = layers;
  state.activeId = layers.some((layer) => layer.id === data.activeId)
    ? data.activeId
    : layers.at(-1).id;
  syncDocument();
}
async function undo(direction) {
  if (!canEdit()) return;
  const next = state.historyIndex + direction;
  if (next < 0 || next >= state.history.length) return;
  state.busy = true;
  updateHistoryButtons();
  try {
    await restore(state.history[next]);
    state.historyIndex = next;
    state.revision++;
    scheduleSave();
  } catch {
    toast("errorRestore");
  } finally {
    state.busy = false;
    updateHistoryButtons();
  }
}
function renderLayers() {
  const list = $("layer-list");
  list.replaceChildren();
  for (const layer of [...state.layers].reverse()) {
    const row = document.createElement("div");
    row.className = `layer-item${layer.id === state.activeId ? " selected" : ""}${layer.visible ? "" : " hidden-layer"}`;
    row.setAttribute("role", "listitem");
    row.dataset.layerId = layer.id;
    const thumbnail = document.createElement("canvas");
    thumbnail.className = "layer-thumbnail";
    thumbnail.width = 80;
    thumbnail.height = 60;
    const scale = Math.min(80 / state.width, 60 / state.height);
    thumbnail
      .getContext("2d")
      .drawImage(
        layer.canvas,
        (80 - state.width * scale) / 2,
        (60 - state.height * scale) / 2,
        state.width * scale,
        state.height * scale,
      );
    thumbnail.setAttribute("aria-hidden", "true");
    const select = document.createElement("button");
    select.className = "layer-name-wrap";
    select.setAttribute(
      "aria-label",
      t("selectLayer", { name: nameOf(layer) }),
    );
    select.setAttribute("aria-pressed", String(layer.id === state.activeId));
    const name = document.createElement("span");
    name.className = "layer-name";
    name.textContent = nameOf(layer);
    const subtitle = document.createElement("span");
    subtitle.className = "layer-subtitle";
    subtitle.textContent = `${t(layer.visible ? { "source-over": "normal", multiply: "multiply", screen: "screen", overlay: "overlay" }[layer.blend] : "hidden")} · ${Math.round(layer.opacity * 100)}%`;
    select.append(name, subtitle);
    if (layer.locked) {
      const lock = document.createElement("span");
      lock.className = "layer-lock-indicator";
      lock.title = t("locked");
      lock.append(icon("lock"));
      row.append(lock);
    }
    const visibility = document.createElement("button");
    visibility.className = "layer-visibility";
    visibility.setAttribute(
      "aria-label",
      t(layer.visible ? "hideLayer" : "showLayer", { name: nameOf(layer) }),
    );
    visibility.title = visibility.getAttribute("aria-label");
    visibility.append(icon(layer.visible ? "eye" : "eye-off"));
    visibility.addEventListener("click", () => {
      if (!canEdit()) return;
      layer.visible = !layer.visible;
      commit();
    });
    select.addEventListener("click", () => {
      if (!canEdit()) return;
      state.activeId = layer.id;
      renderLayers();
      state.revision++;
      scheduleSave();
    });
    select.addEventListener("dblclick", openRename);
    thumbnail.addEventListener("click", () => select.click());
    row.append(thumbnail, select, visibility);
    list.append(row);
  }
  const layer = activeLayer();
  if (!layer) return;
  $("layer-count").textContent = state.layers.length;
  $("layer-opacity").value = Math.round(layer.opacity * 100);
  $("layer-opacity-value").textContent = `${$("layer-opacity").value}%`;
  $("blend-mode").value = layer.blend;
  $("delete-layer").disabled = state.layers.length <= 1;
  $("add-layer").disabled = state.layers.length >= MAX_LAYERS;
  $("duplicate-layer").disabled = state.layers.length >= MAX_LAYERS;
  const index = state.layers.indexOf(layer);
  $("layer-up").disabled = index === state.layers.length - 1;
  $("layer-down").disabled = index === 0;
  $("layer-lock").setAttribute("aria-pressed", String(layer.locked));
  $("merge-layer").disabled =
    index === 0 ||
    layer.blend !== "source-over" ||
    state.layers[index - 1]?.blend !== "source-over";
}
function addLayer() {
  if (!canEdit() || state.layers.length >= MAX_LAYERS) return;
  const layer = makeLayer("", "layerDefault", { n: state.layers.length + 1 });
  state.layers.splice(state.layers.indexOf(activeLayer()) + 1, 0, layer);
  state.activeId = layer.id;
  commit();
}
function selectTool(tool) {
  state.tool = tool;
  document.querySelectorAll("[data-tool]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === tool);
    button.setAttribute("aria-pressed", String(button.dataset.tool === tool));
  });
  $("active-tool-name").textContent = t(tool === "brush" ? state.brush : tool);
  $("tool-hint").textContent = t(
    tool === "hand"
      ? "panHint"
      : tool === "fill"
        ? "fillHint"
        : ["line", "rectangle", "ellipse"].includes(tool)
          ? "shapeHint"
          : "freely",
  );
  $("shape-fill").hidden = !["rectangle", "ellipse"].includes(tool);
  canvas.style.cursor = tool === "hand" || state.space ? "grab" : "crosshair";
}
function selectBrush(brush) {
  state.brush = brush;
  state.size = brushPresets[brush].size;
  state.opacity = brushPresets[brush].opacity;
  document.querySelectorAll("[data-brush]").forEach((button) => {
    button.classList.toggle("selected", button.dataset.brush === brush);
    button.setAttribute("aria-pressed", String(button.dataset.brush === brush));
  });
  selectTool("brush");
  syncBrush();
}
function syncBrush() {
  for (const id of ["brush-size", "mobile-brush-size"])
    $(id).value = state.size;
  for (const id of ["brush-opacity", "mobile-brush-opacity"])
    $(id).value = state.opacity;
  for (const id of ["size-value", "mobile-size-value"])
    $(id).textContent = `${state.size} px`;
  for (const id of ["opacity-value", "mobile-opacity-value"])
    $(id).textContent = `${state.opacity}%`;
  for (const id of ["stabilization", "mobile-stabilization"])
    $(id).value = settings.stabilization;
  for (const id of ["stabilization-value", "mobile-stabilization-value"])
    $(id).textContent = `${settings.stabilization}%`;
  const preview = $("brush-preview").getContext("2d");
  preview.clearRect(0, 0, 240, 75);
  let previous = { x: 20, y: 45, pressure: 0.3 };
  const config = {
    brush: state.brush,
    size: Math.min(27, state.size),
    opacity: state.opacity,
    color: state.color,
    pressure: settings.pressure,
    erasing: false,
  };
  for (let step = 1; step <= 45; step++) {
    const fraction = step / 45;
    const next = {
      x: 20 + fraction * 200,
      y: 38 - Math.sin(fraction * Math.PI * 2) * 16,
      pressure: 0.3 + Math.sin(fraction * Math.PI) * 0.5,
    };
    brushSegment(preview, previous, next, config);
    previous = next;
  }
}
function hexToHsv(hex) {
  const [r, g, b] = hex.match(/[a-f\d]{2}/gi).map((p) => parseInt(p, 16) / 255),
    max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min;
  const h = !d
    ? 0
    : max === r
      ? ((g - b) / d) % 6
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}
function hsvToHex(h, s, v) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(5)}${f(3)}${f(1)}`;
}
function setColor(color, preserveHsv = false) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return;
  state.color = color.toLowerCase();
  if (!preserveHsv) {
    const { h, s, v } = hexToHsv(color);
    if (s) state.hue = h;
    state.saturation = s;
    state.value = v;
  }
  $("color-input").value = state.color;
  $("hex-input").value = state.color.toUpperCase();
  $("foreground-button").style.setProperty(
    "background",
    state.color,
    "important",
  );
  $("color-field").style.background =
    `linear-gradient(0deg,#000,transparent),linear-gradient(90deg,#fff,hsl(${state.hue},100%,50%))`;
  $("color-picker-handle").style.left = `${state.saturation * 100}%`;
  $("color-picker-handle").style.top = `${(1 - state.value) * 100}%`;
  $("color-field").setAttribute(
    "aria-valuenow",
    String(Math.round(state.saturation * 100)),
  );
  $("color-field").setAttribute("aria-valuetext", state.color.toUpperCase());
  $("hue").value = state.hue;
  document
    .querySelectorAll(".color-swatch")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.color.toLowerCase() === state.color),
      ),
    );
  syncBrush();
}
function applyTransform() {
  $("canvas-shell").style.transform =
    `translate(-50%,-50%) translate(${state.panX}px,${state.panY}px) scale(${state.zoom}) rotate(${state.rotation}deg)`;
  $("zoom-value").textContent = `${Math.round(state.zoom * 100)}%`;
  $("rotation-value").textContent = `${Math.round(state.rotation)}°`;
}
function fitCanvas() {
  const landscape = viewport.clientHeight < 350;
  const marginX = viewport.clientWidth < 600 ? 100 : 145;
  state.rotation = 0;
  state.zoom = Math.max(
    0.025,
    Math.min(
      1,
      (viewport.clientWidth - marginX) / state.width,
      (viewport.clientHeight - (landscape ? 80 : 140)) / state.height,
    ),
  );
  state.panX = landscape ? 0 : 20;
  state.panY = 0;
  applyTransform();
}
function screenToCanvas(x, y) {
  const rect = viewport.getBoundingClientRect(),
    dx = x - rect.left - rect.width / 2 - state.panX,
    dy = y - rect.top - rect.height / 2 - state.panY,
    angle = (state.rotation * Math.PI) / 180;
  return {
    x:
      (dx * Math.cos(angle) + dy * Math.sin(angle)) / state.zoom +
      state.width / 2,
    y:
      (-dx * Math.sin(angle) + dy * Math.cos(angle)) / state.zoom +
      state.height / 2,
  };
}
function point(event) {
  return {
    ...screenToCanvas(event.clientX, event.clientY),
    pressure:
      event.pointerType === "pen" ? Math.max(0.05, event.pressure) : 0.65,
  };
}
function anchorView(anchor, x, y) {
  const rect = viewport.getBoundingClientRect(),
    angle = (state.rotation * Math.PI) / 180,
    dx = anchor.x - state.width / 2,
    dy = anchor.y - state.height / 2;
  state.panX =
    x -
    rect.left -
    rect.width / 2 -
    state.zoom * (dx * Math.cos(angle) - dy * Math.sin(angle));
  state.panY =
    y -
    rect.top -
    rect.height / 2 -
    state.zoom * (dx * Math.sin(angle) + dy * Math.cos(angle));
  applyTransform();
}
function zoomBy(factor, x, y) {
  const rect = viewport.getBoundingClientRect();
  x ??= rect.left + rect.width / 2;
  y ??= rect.top + rect.height / 2;
  const anchor = screenToCanvas(x, y);
  state.zoom = Math.max(0.025, Math.min(6, state.zoom * factor));
  anchorView(anchor, x, y);
}
function brushConfig() {
  return {
    brush: state.brush,
    size: state.size,
    opacity: state.opacity,
    color: state.color,
    erasing: state.tool === "eraser",
    pressure: settings.pressure,
  };
}
function strokeSegment(ctx, from, to, dot = false) {
  withSymmetry(ctx, state.width, state.height, state.symmetry, () =>
    brushSegment(ctx, from, to, brushConfig(), dot),
  );
}
function cancelDrawing() {
  if (state.drawing?.before) {
    layerContext(state.drawing.layer).putImageData(state.drawing.before, 0, 0);
    render();
  }
  state.drawing = null;
}
function touchMetrics() {
  const [a, b] = [...touches.values()];
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
    angle: Math.atan2(b.y - a.y, b.x - a.x),
  };
}
function tapAction(event) {
  const p = point(event);
  if (state.tool === "eyedropper") {
    const x = Math.min(state.width - 1, Math.max(0, Math.floor(p.x))),
      y = Math.min(state.height - 1, Math.max(0, Math.floor(p.y)));
    const [r, g, b, a] = context.getImageData(x, y, 1, 1).data;
    if (a)
      setColor(
        `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`,
      );
    selectTool("brush");
  } else if (
    floodFill(layerContext(), state.width, state.height, p, {
      color: state.color,
      opacity: state.opacity,
      tolerance: settings.tolerance,
    })
  )
    commit();
}
viewport.addEventListener("pointerdown", (event) => {
  if (
    event.target.closest("button,select,input,.tool-palette,.zoom-controls") ||
    state.busy ||
    ![0, 1].includes(event.button)
  )
    return;
  if (event.pointerType === "touch" && state.penActive) return;
  event.preventDefault();
  viewport.setPointerCapture(event.pointerId);
  if (event.target === canvas) canvas.focus({ preventScroll: true });
  if (event.pointerType === "touch") {
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touches.size >= 2) {
      cancelDrawing();
      const metrics = touchMetrics();
      state.gesture = {
        ...metrics,
        zoom: state.zoom,
        rotation: state.rotation,
        anchor: screenToCanvas(metrics.x, metrics.y),
      };
      return;
    }
  }
  if (event.pointerType === "pen") {
    state.penActive = true;
    if (state.drawing) cancelDrawing();
    state.gesture = null;
    touches.clear();
  }
  if (state.drawing || state.gesture) return;
  if (
    state.tool === "hand" ||
    state.space ||
    event.button === 1 ||
    (event.pointerType === "touch" && !settings.finger)
  ) {
    state.drawing = {
      type: "pan",
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      panX: state.panX,
      panY: state.panY,
    };
    canvas.style.cursor = "grabbing";
    return;
  }
  if (event.target !== canvas) return;
  const layer = activeLayer();
  if (
    state.tool !== "eyedropper" &&
    (!layer.visible || layer.locked || layer.opacity === 0)
  ) {
    toast("errorLayer");
    return;
  }
  if (["fill", "eyedropper"].includes(state.tool)) {
    if (event.pointerType === "touch")
      state.drawing = { type: "tap", pointerId: event.pointerId };
    else tapAction(event);
    return;
  }
  const p = point(event),
    type = ["line", "rectangle", "ellipse"].includes(state.tool)
      ? "shape"
      : "stroke";
  state.drawing = {
    type,
    pointerId: event.pointerId,
    start: p,
    last: p,
    layer,
    before: layerContext(layer).getImageData(0, 0, state.width, state.height),
  };
  if (type === "stroke") {
    strokeSegment(layerContext(layer), p, p, true);
    requestRender();
  }
});
function updateCursor(event) {
  const cursor = $("brush-cursor");
  if (
    event.pointerType === "touch" ||
    !["brush", "eraser"].includes(state.tool) ||
    event.target !== canvas
  ) {
    cursor.hidden = true;
    return;
  }
  const rect = viewport.getBoundingClientRect();
  cursor.style.left = `${event.clientX - rect.left}px`;
  cursor.style.top = `${event.clientY - rect.top}px`;
  cursor.style.width =
    cursor.style.height = `${Math.max(3, state.size * state.zoom)}px`;
  cursor.hidden = false;
}
viewport.addEventListener("pointermove", (event) => {
  updateCursor(event);
  if (touches.has(event.pointerId))
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (state.gesture && touches.size >= 2) {
    const metrics = touchMetrics();
    state.zoom = Math.max(
      0.025,
      Math.min(
        6,
        (state.gesture.zoom * metrics.distance) / state.gesture.distance,
      ),
    );
    state.rotation =
      state.gesture.rotation +
      ((metrics.angle - state.gesture.angle) * 180) / Math.PI;
    anchorView(state.gesture.anchor, metrics.x, metrics.y);
    return;
  }
  const drawing = state.drawing;
  if (!drawing || drawing.pointerId !== event.pointerId) return;
  if (drawing.type === "pan") {
    state.panX = drawing.panX + event.clientX - drawing.x;
    state.panY = drawing.panY + event.clientY - drawing.y;
    applyTransform();
    return;
  }
  if (drawing.type === "tap") return;
  const ctx = layerContext(drawing.layer);
  if (drawing.type === "shape") {
    ctx.putImageData(drawing.before, 0, 0);
    withSymmetry(ctx, state.width, state.height, state.symmetry, () =>
      drawShape(ctx, drawing.start, point(event), {
        tool: state.tool,
        color: state.color,
        size: state.size,
        opacity: state.opacity,
        fill: state.shapeFill,
        constrain: event.shiftKey,
      }),
    );
  } else {
    const samples = event.getCoalescedEvents?.();
    for (const entry of samples?.length ? samples : [event]) {
      let p = point(entry);
      if (settings.stabilization) {
        const weight = 1 - settings.stabilization / 100;
        p = {
          ...p,
          x: drawing.last.x + (p.x - drawing.last.x) * weight,
          y: drawing.last.y + (p.y - drawing.last.y) * weight,
        };
      }
      strokeSegment(ctx, drawing.last, p);
      drawing.last = p;
    }
  }
  requestRender();
});
function finishPointer(event, cancel = false) {
  touches.delete(event.pointerId);
  if (event.pointerType === "pen") state.penActive = false;
  if (state.gesture) {
    if (touches.size < 2) state.gesture = null;
    return;
  }
  const drawing = state.drawing;
  if (!drawing || drawing.pointerId !== event.pointerId) return;
  if (cancel) {
    cancelDrawing();
  } else if (drawing.type === "tap") {
    state.drawing = null;
    tapAction(event);
  } else {
    if (drawing.type === "stroke" && settings.stabilization)
      strokeSegment(layerContext(drawing.layer), drawing.last, point(event));
    state.drawing = null;
    if (drawing.type !== "pan") commit();
  }
  if (viewport.hasPointerCapture(event.pointerId))
    viewport.releasePointerCapture(event.pointerId);
  canvas.style.cursor =
    state.tool === "hand" || state.space ? "grab" : "crosshair";
}
viewport.addEventListener("pointerup", (event) => finishPointer(event));
viewport.addEventListener("pointercancel", (event) =>
  finishPointer(event, true),
);
viewport.addEventListener("lostpointercapture", (event) =>
  finishPointer(event, true),
);
viewport.addEventListener("pointerleave", () => {
  $("brush-cursor").hidden = true;
});

function download(blob, extension) {
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = `${
    titleOf()
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
      .trim() || "DrawSketch"
  }.${extension}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function saveProject() {
  if (!canEdit()) return;
  download(
    new Blob([JSON.stringify(snapshot())], { type: "application/json" }),
    "drawsketch",
  );
  toast("projectSaved");
}
function openRename() {
  if (!canEdit()) return;
  $("layer-name-input").value = nameOf(activeLayer());
  $("rename-dialog").showModal();
  $("layer-name-input").select();
}
function applyTheme() {
  const dark =
    settings.theme === "dark" ||
    (settings.theme === "system" &&
      matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]').content = dark
    ? "#171717"
    : "#fff9f3";
}
function persistSettings() {
  if (!safeWrite(SETTINGS_KEY, JSON.stringify(settings))) toast("errorSave");
}
function refreshLanguage() {
  setLanguage(settings.language);
  syncTitle();
  selectTool(state.tool);
  renderLayers();
  setSaveStatus(saveStatusKey);
  document.querySelectorAll(".color-swatch").forEach((button) => {
    button.title = t("swatch", { color: button.dataset.color });
    button.setAttribute("aria-label", button.title);
  });
  if (currentToast)
    $("toast").textContent = t(currentToast.key, currentToast.params);
  if ($("gallery-dialog").open) renderGallery();
  if (state.layers.length) {
    state.revision++;
    scheduleSave();
  }
}
function toggleProperties(open) {
  if (state.focus) {
    state.focus = false;
    document.body.dataset.focus = "false";
    $("focus-button").setAttribute("aria-pressed", "false");
  }
  $("properties-panel").classList.toggle("open", open);
  $("properties-backdrop").hidden = !open;
  $("toggle-properties").setAttribute("aria-expanded", String(open));
  if (matchMedia("(max-width:899px)").matches) {
    if (open) $("close-properties").focus();
    else $("toggle-properties").focus();
  }
}
function toggleFocus() {
  state.focus = !state.focus;
  document.body.dataset.focus = String(state.focus);
  $("focus-button").setAttribute("aria-pressed", String(state.focus));
  $("properties-panel").classList.remove("open");
  $("properties-backdrop").hidden = true;
  $("toggle-properties").setAttribute("aria-expanded", "false");
}
async function renderGallery() {
  const list = $("gallery-list");
  list.replaceChildren();
  try {
    const records = await listDocuments();
    if (!records.length) {
      const empty = document.createElement("p");
      empty.className = "gallery-empty";
      empty.textContent = t("galleryEmpty");
      list.append(empty);
    }
    for (const record of records) {
      const name = titleKeys.has(record.data.titleKey)
        ? t(record.data.titleKey)
        : record.title;
      const card = document.createElement("button");
      card.className = "gallery-card";
      card.setAttribute("aria-label", t("openDrawing", { name }));
      const image = new Image();
      image.src = record.thumbnail;
      image.alt = "";
      const title = document.createElement("strong");
      title.textContent = name;
      const date = document.createElement("small");
      date.textContent = t("gallerySaved", {
        date: new Intl.DateTimeFormat(getLanguage(), {
          month: "short",
          day: "numeric",
          year: "numeric",
        }).format(record.updatedAt),
      });
      card.append(image, title, date);
      card.addEventListener("click", async () => {
        if (!canEdit()) return;
        if (!(await saveLocal())) return;
        state.busy = true;
        try {
          await restore(record.data);
          state.history = [];
          state.historyIndex = -1;
          commit();
          fitCanvas();
          $("gallery-dialog").close();
          toast("projectOpened");
        } catch {
          toast("errorProject");
        } finally {
          state.busy = false;
          updateHistoryButtons();
        }
      });
      list.append(card);
    }
  } catch {
    toast("errorGallery");
  }
}

// Brush and color studio.
document.querySelectorAll("[data-tool]").forEach((button) =>
  button.addEventListener("click", () => {
    if (!state.drawing && !state.gesture) selectTool(button.dataset.tool);
  }),
);
document.querySelectorAll("[data-brush]").forEach((button) =>
  button.addEventListener("click", () => {
    if (!state.drawing && !state.gesture) selectBrush(button.dataset.brush);
  }),
);
for (const id of ["brush-size", "mobile-brush-size"])
  $(id).addEventListener("input", (event) => {
    state.size = Number(event.target.value);
    brushPresets[state.brush].size = state.size;
    syncBrush();
  });
for (const id of ["brush-opacity", "mobile-brush-opacity"])
  $(id).addEventListener("input", (event) => {
    state.opacity = Number(event.target.value);
    brushPresets[state.brush].opacity = state.opacity;
    syncBrush();
  });
for (const id of ["stabilization", "mobile-stabilization"])
  $(id).addEventListener("input", (event) => {
    settings.stabilization = Number(event.target.value);
    syncBrush();
    persistSettings();
  });
$("choose-brush").addEventListener("click", () => {
  if (canEdit()) $("brush-dialog").showModal();
});
$("brush-dialog-done").addEventListener("click", () =>
  $("brush-dialog").close(),
);
$("symmetry").addEventListener("change", (event) => {
  state.symmetry = event.target.value;
  $("symmetry-guide").dataset.axis = state.symmetry;
});
$("shape-fill").addEventListener("click", () => {
  state.shapeFill = !state.shapeFill;
  $("shape-fill").setAttribute("aria-pressed", String(state.shapeFill));
});
$("foreground-button").addEventListener("click", () => {
  if (matchMedia("(max-width:899px)").matches) toggleProperties(true);
  else $("color-input").click();
});
$("color-input").addEventListener("input", (event) =>
  setColor(event.target.value),
);
$("hex-input").addEventListener("change", (event) => {
  const value = event.target.value.startsWith("#")
    ? event.target.value
    : `#${event.target.value}`;
  if (/^#[0-9a-f]{6}$/i.test(value)) setColor(value);
  else {
    event.target.value = state.color.toUpperCase();
    toast("errorHex");
  }
});
for (const color of swatches) {
  const button = document.createElement("button");
  button.className = "color-swatch";
  button.dataset.color = color;
  button.style.setProperty("background-color", color, "important");
  button.title = t("swatch", { color });
  button.setAttribute("aria-label", button.title);
  button.addEventListener("click", () => setColor(color));
  $("color-swatches").append(button);
}
$("hue").addEventListener("input", (event) => {
  state.hue = Number(event.target.value);
  setColor(hsvToHex(state.hue, state.saturation, state.value), true);
});
function pickField(event) {
  const rect = $("color-field").getBoundingClientRect();
  state.saturation = Math.max(
    0,
    Math.min(1, (event.clientX - rect.left) / rect.width),
  );
  state.value =
    1 - Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
  setColor(hsvToHex(state.hue, state.saturation, state.value), true);
}
$("color-field").addEventListener("pointerdown", (event) => {
  $("color-field").setPointerCapture(event.pointerId);
  pickField(event);
});
$("color-field").addEventListener("pointermove", (event) => {
  if ($("color-field").hasPointerCapture(event.pointerId)) pickField(event);
});
$("color-field").addEventListener("pointerup", (event) => {
  if ($("color-field").hasPointerCapture(event.pointerId))
    $("color-field").releasePointerCapture(event.pointerId);
});
$("color-field").addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key))
    return;
  event.preventDefault();
  state.saturation = Math.max(
    0,
    Math.min(
      1,
      state.saturation +
        (event.key === "ArrowLeft"
          ? -0.02
          : event.key === "ArrowRight"
            ? 0.02
            : 0),
    ),
  );
  state.value = Math.max(
    0,
    Math.min(
      1,
      state.value +
        (event.key === "ArrowDown"
          ? -0.02
          : event.key === "ArrowUp"
            ? 0.02
            : 0),
    ),
  );
  setColor(hsvToHex(state.hue, state.saturation, state.value), true);
});

// Every layer edit participates in undo/redo, including names and locks.
$("add-layer").addEventListener("click", addLayer);
$("delete-layer").addEventListener("click", () => {
  if (!canEdit() || state.layers.length <= 1) return;
  const index = state.layers.indexOf(activeLayer());
  state.layers.splice(index, 1);
  state.activeId = state.layers[Math.max(0, index - 1)].id;
  commit();
});
$("duplicate-layer").addEventListener("click", () => {
  if (!canEdit() || state.layers.length >= MAX_LAYERS) return;
  const source = activeLayer(),
    layer = makeLayer("", "layerDefault", { n: state.layers.length + 1 });
  layer.visible = source.visible;
  layer.opacity = source.opacity;
  layer.blend = source.blend;
  layerContext(layer).drawImage(source.canvas, 0, 0);
  state.layers.splice(state.layers.indexOf(source) + 1, 0, layer);
  state.activeId = layer.id;
  commit();
});
for (const [id, offset] of [
  ["layer-up", 1],
  ["layer-down", -1],
])
  $(id).addEventListener("click", () => {
    if (!canEdit()) return;
    const from = state.layers.indexOf(activeLayer()),
      to = from + offset;
    if (to < 0 || to >= state.layers.length) return;
    [state.layers[from], state.layers[to]] = [
      state.layers[to],
      state.layers[from],
    ];
    commit();
  });
$("layer-opacity").addEventListener("input", (event) => {
  if (!canEdit()) return;
  activeLayer().opacity = Number(event.target.value) / 100;
  $("layer-opacity-value").textContent = `${event.target.value}%`;
  render();
});
$("layer-opacity").addEventListener("change", () => {
  if (canEdit()) commit();
});
$("blend-mode").addEventListener("change", (event) => {
  if (!canEdit()) return;
  activeLayer().blend = event.target.value;
  commit();
});
$("canvas-background").addEventListener("change", (event) => {
  if (!canEdit()) return;
  state.background = event.target.value;
  commit();
});
$("layer-lock").addEventListener("click", () => {
  if (!canEdit()) return;
  activeLayer().locked = !activeLayer().locked;
  commit();
});
$("rename-layer").addEventListener("click", openRename);
$("rename-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!canEdit()) return;
  const layer = activeLayer();
  layer.name = $("layer-name-input").value.trim() || nameOf(layer);
  layer.nameKey = "";
  layer.nameParams = {};
  commit();
  $("rename-dialog").close();
});
$("merge-layer").addEventListener("click", () => {
  if (!canEdit()) return;
  const top = activeLayer(),
    index = state.layers.indexOf(top),
    bottom = state.layers[index - 1];
  if (!bottom || top.blend !== "source-over" || bottom.blend !== "source-over")
    return;
  if (top.locked || bottom.locked || !top.visible || !bottom.visible) {
    toast("errorMerge");
    return;
  }
  const merged = makeLayer(nameOf(bottom), bottom.nameKey, bottom.nameParams),
    ctx = layerContext(merged);
  ctx.globalAlpha = bottom.opacity;
  ctx.drawImage(bottom.canvas, 0, 0);
  ctx.globalAlpha = top.opacity;
  ctx.drawImage(top.canvas, 0, 0);
  ctx.globalAlpha = 1;
  state.layers.splice(index - 1, 2, merged);
  state.activeId = merged.id;
  commit();
});

// Canvas navigation: the same coordinates work with rotation, zoom, and touch.
$("undo").addEventListener("click", () => undo(-1));
$("redo").addEventListener("click", () => undo(1));
$("zoom-in").addEventListener("click", () => zoomBy(1.25));
$("zoom-out").addEventListener("click", () => zoomBy(0.8));
$("zoom-value").addEventListener("click", () => {
  state.zoom = 1;
  state.panX = state.panY = 0;
  state.rotation = 0;
  applyTransform();
});
$("fit-canvas").addEventListener("click", fitCanvas);
$("rotate-canvas").addEventListener("click", () => {
  state.rotation = (state.rotation + 15) % 360;
  applyTransform();
});
$("toggle-grid").addEventListener("click", () => {
  $("paper-grid").hidden = !$("paper-grid").hidden;
  $("toggle-grid").setAttribute(
    "aria-pressed",
    String(!$("paper-grid").hidden),
  );
});
$("focus-button").addEventListener("click", toggleFocus);
$("toggle-properties").addEventListener("click", () =>
  toggleProperties(!$("properties-panel").classList.contains("open")),
);
$("close-properties").addEventListener("click", () => toggleProperties(false));
$("properties-backdrop").addEventListener("click", () =>
  toggleProperties(false),
);
viewport.addEventListener(
  "wheel",
  (event) => {
    if (state.drawing || state.gesture) return;
    event.preventDefault();
    if (event.ctrlKey || event.metaKey)
      zoomBy(Math.exp(-event.deltaY * 0.005), event.clientX, event.clientY);
    else {
      state.panX -= event.deltaX;
      state.panY -= event.deltaY;
      applyTransform();
    }
  },
  { passive: false },
);
new ResizeObserver(fitCanvas).observe(viewport);

// Local projects and sketchbook. No network, accounts, or upload required.
$("document-name").addEventListener("change", (event) => {
  if (!canEdit()) return;
  state.title = event.target.value.trim() || t("untitled");
  state.titleKey = "";
  syncTitle();
  commit();
});
$("save-project").addEventListener("click", saveProject);
$("export-image").addEventListener("click", () => {
  if (!canEdit()) return;
  const output = document.createElement("canvas");
  output.width = state.width;
  output.height = state.height;
  composite(output.getContext("2d"));
  output.toBlob((blob) => {
    if (blob) {
      download(blob, "png");
      toast("pngSaved");
    }
  }, "image/png");
});
$("new-document").addEventListener("click", () => {
  if (!canEdit()) return;
  $("new-name").value = t("untitled");
  $("new-dialog").showModal();
});
document.querySelectorAll("[data-canvas-size]").forEach((button) =>
  button.addEventListener("click", () => {
    const [w, h] = button.dataset.canvasSize.split(",");
    $("new-width").value = w;
    $("new-height").value = h;
  }),
);
$("new-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!canEdit()) return;
  const width = Number($("new-width").value),
    height = Number($("new-height").value);
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 64 ||
    height < 64 ||
    width > 4096 ||
    height > 4096 ||
    width * height > MAX_PIXELS
  ) {
    toast("errorDimensions");
    return;
  }
  if (!(await saveLocal())) return;
  state.id = crypto.randomUUID();
  state.width = width;
  state.height = height;
  state.title = $("new-name").value.trim() || t("untitled");
  state.titleKey = state.title === t("untitled") ? "untitled" : "";
  state.background = $("new-background").value;
  const layer = makeLayer("", "layerDefault", { n: 1 });
  state.layers = [layer];
  state.activeId = layer.id;
  state.history = [];
  state.historyIndex = -1;
  savedRevision = -1;
  syncDocument();
  fitCanvas();
  commit();
  $("new-dialog").close();
  selectTool("brush");
  toast("canvasCreated");
});
$("import-image").addEventListener("click", () => {
  if (canEdit()) $("image-file").click();
});
$("image-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file || !canEdit()) return;
  if (state.layers.length >= MAX_LAYERS) {
    toast("errorLayerLimit", { n: MAX_LAYERS });
    return;
  }
  if (file.size > 30_000_000) {
    toast("errorFileSize");
    return;
  }
  state.busy = true;
  updateHistoryButtons();
  try {
    const image = await createImageBitmap(file, {
        imageOrientation: "from-image",
      }),
      layer = makeLayer(file.name.replace(/\.[^.]+$/, "").slice(0, 80));
    const scale = Math.min(
        1,
        state.width / image.width,
        state.height / image.height,
      ),
      w = image.width * scale,
      h = image.height * scale;
    layerContext(layer).drawImage(
      image,
      (state.width - w) / 2,
      (state.height - h) / 2,
      w,
      h,
    );
    image.close();
    state.layers.push(layer);
    state.activeId = layer.id;
    commit();
    toast("imageImported");
  } catch {
    toast("errorImage");
  } finally {
    state.busy = false;
    updateHistoryButtons();
  }
});
$("open-project").addEventListener("click", () => {
  if (canEdit()) $("project-file").click();
});
$("project-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file || !canEdit()) return;
  if (file.size > 30_000_000) {
    toast("errorFileSize");
    return;
  }
  state.busy = true;
  updateHistoryButtons();
  try {
    const project = JSON.parse(await file.text());
    if (!validProject(project)) throw new Error("Invalid project");
    if (!(await saveLocal())) return;
    await restore({ ...project, id: crypto.randomUUID() });
    state.history = [];
    state.historyIndex = -1;
    savedRevision = -1;
    commit();
    fitCanvas();
    toast("projectOpened");
  } catch {
    toast("errorProject");
  } finally {
    state.busy = false;
    updateHistoryButtons();
  }
});
const galleryFileButton = document.createElement("button");
galleryFileButton.className = "button gallery-file-button";
galleryFileButton.dataset.i18n = "open";
galleryFileButton.textContent = t("open");
galleryFileButton.addEventListener("click", () => {
  $("gallery-dialog").close();
  $("project-file").click();
});
$("gallery-dialog").append(galleryFileButton);
$("gallery-button").addEventListener("click", async () => {
  if (!canEdit()) return;
  await saveLocal();
  await renderGallery();
  $("gallery-dialog").showModal();
});

// Preferences, complete localization, and installation.
$("settings-button").addEventListener("click", () => {
  if (canEdit()) $("settings-dialog").showModal();
});
$("language-select").value = settings.language;
$("theme-select").value = settings.theme;
$("pressure-setting").checked = settings.pressure;
$("finger-setting").checked = settings.finger;
$("fill-tolerance").value = settings.tolerance;
$("tolerance-value").textContent = settings.tolerance;
$("language-select").addEventListener("change", (event) => {
  settings.language = event.target.value;
  persistSettings();
  refreshLanguage();
});
$("theme-select").addEventListener("change", (event) => {
  settings.theme = event.target.value;
  applyTheme();
  persistSettings();
});
$("pressure-setting").addEventListener("change", (event) => {
  settings.pressure = event.target.checked;
  persistSettings();
  syncBrush();
});
$("finger-setting").addEventListener("change", (event) => {
  settings.finger = event.target.checked;
  persistSettings();
});
$("fill-tolerance").addEventListener("input", (event) => {
  settings.tolerance = Number(event.target.value);
  $("tolerance-value").textContent = settings.tolerance;
  persistSettings();
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (settings.theme === "system") applyTheme();
});
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
});
$("install-app").addEventListener("click", async () => {
  if (installPrompt) {
    await installPrompt.prompt();
    installPrompt = null;
  } else {
    document
      .querySelector(".install-hint")
      .scrollIntoView({ block: "nearest", behavior: "smooth" });
    toast("installHint");
  }
});
window.addEventListener("appinstalled", () => {
  installPrompt = null;
  toast("installed");
});
$("help-button").addEventListener("click", () => $("help-dialog").showModal());
document
  .querySelectorAll(".close-dialog")
  .forEach((button) =>
    button.addEventListener("click", () => button.closest("dialog").close()),
  );
document.querySelectorAll("dialog").forEach((dialog) =>
  dialog.addEventListener("click", (event) => {
    const r = dialog.getBoundingClientRect();
    if (
      event.target === dialog &&
      (event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom)
    )
      dialog.close();
  }),
);

// Shortcuts never intercept typing or the keyboard inside a dialog.
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.focus) {
    toggleFocus();
    $("focus-button").focus();
    return;
  }
  if (
    event.key === "Tab" &&
    $("properties-panel").classList.contains("open") &&
    matchMedia("(max-width:899px)").matches
  ) {
    const targets = [
      ...$("properties-panel").querySelectorAll(
        'button:not(:disabled),input,select,[tabindex="0"]',
      ),
    ].filter((el) => el.getClientRects().length);
    const first = targets[0],
      last = targets.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
      return;
    }
  }
  if (
    event.key === "Escape" &&
    $("properties-panel").classList.contains("open")
  ) {
    toggleProperties(false);
    return;
  }
  const editing =
      ["INPUT", "TEXTAREA", "SELECT"].includes(
        document.activeElement.tagName,
      ) || document.activeElement.isContentEditable,
    modifier = event.ctrlKey || event.metaKey;
  if (modifier && event.key.toLowerCase() === "s") {
    event.preventDefault();
    if (!document.querySelector("dialog[open]")) saveProject();
    return;
  }
  if (editing || document.querySelector("dialog[open]")) return;
  if (modifier && ["z", "y"].includes(event.key.toLowerCase())) {
    event.preventDefault();
    undo(event.shiftKey || event.key.toLowerCase() === "y" ? 1 : -1);
    return;
  }
  if (modifier || event.altKey) return;
  if (event.code === "Space") {
    event.preventDefault();
    state.space = true;
    canvas.style.cursor = "grab";
    return;
  }
  if (state.drawing || state.gesture) return;
  if (
    event.key === "Tab" &&
    (event.target === document.body || event.target === canvas)
  ) {
    event.preventDefault();
    toggleFocus();
    return;
  }
  const tool = {
    b: "brush",
    e: "eraser",
    g: "fill",
    i: "eyedropper",
    l: "line",
    r: "rectangle",
    o: "ellipse",
    h: "hand",
  }[event.key.toLowerCase()];
  if (tool) selectTool(tool);
  else if (event.key.toLowerCase() === "f") fitCanvas();
  else if (event.key === "[" || event.key === "]") {
    state.size = Math.max(
      1,
      Math.min(160, state.size + (event.key === "[" ? -2 : 2)),
    );
    syncBrush();
  }
});
document.addEventListener("keyup", (event) => {
  if (event.code === "Space") {
    state.space = false;
    canvas.style.cursor = state.tool === "hand" ? "grab" : "crosshair";
  }
});
window.addEventListener("blur", () => {
  state.space = false;
  cancelDrawing();
  touches.clear();
  state.gesture = null;
  state.penActive = false;
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && !state.busy && !state.drawing) saveLocal();
});
window.addEventListener("pagehide", () => {
  if (state.busy || !state.layers.length) return;
  if (savedRevision !== state.revision) {
    cancelDrawing();
    safeWrite(
      RECOVERY_KEY,
      JSON.stringify({ updatedAt: Date.now(), data: snapshot() }),
    );
    saveLocal();
  }
});

async function initialize() {
  applyTheme();
  let loaded = false;
  try {
    const recovery = JSON.parse(safeRead(RECOVERY_KEY) || "null"),
      last = safeRead(LAST_KEY);
    const record = last ? await getDocument(last) : null;
    if (recovery && (!record || recovery.updatedAt > record.updatedAt)) {
      await restore(recovery.data);
      loaded = true;
    } else if (record) {
      await restore(record.data);
      loaded = true;
    } else {
      const legacy = safeRead(legacyKey);
      if (legacy) {
        await restore(JSON.parse(legacy));
        loaded = true;
      }
    }
  } catch {
    toast("errorLocal");
  }
  if (!loaded) {
    const wash = makeLayer("", "demoWash"),
      ink = makeLayer("", "demoLines");
    state.layers = [wash, ink];
    state.activeId = ink.id;
    paintDemo(layerContext(wash), layerContext(ink), state.width, state.height);
  }
  syncDocument();
  setColor(state.color);
  selectTool("brush");
  state.busy = false;
  commit();
  fitCanvas();
  applyTranslations();
  document.documentElement.dataset.ready = "true";
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then(async () => {
        await navigator.serviceWorker.ready;
        document.documentElement.dataset.offline = "ready";
      })
      .catch((error) =>
        console.warn("Offline registration unavailable:", error),
      );
  }
}
initialize().catch((error) => {
  console.error(error);
  toast("errorStart");
});
