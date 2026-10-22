export function initNavigator(api) {
  const { $, state } = api,
    canvas = $("navigator-canvas"),
    ctx = canvas.getContext("2d"),
    thumbnail = document.createElement("canvas");
  thumbnail.width = canvas.width;
  thumbnail.height = canvas.height;
  let sceneDirty = true,
    timer,
    dragging = null;
  const geometry = () => {
    const scale = Math.min(
      (canvas.width - 12) / state.width,
      (canvas.height - 12) / state.height,
    );
    return {
      scale,
      x: (canvas.width - state.width * scale) / 2,
      y: (canvas.height - state.height * scale) / 2,
    };
  };
  function render() {
    if ($("navigator-panel").hidden || !state.layers.length) return;
    const { scale, x, y } = geometry();
    if (sceneDirty) {
      const target = thumbnail.getContext("2d");
      target.clearRect(0, 0, canvas.width, canvas.height);
      target.drawImage(
        $("drawing-canvas"),
        x,
        y,
        state.width * scale,
        state.height * scale,
      );
      sceneDirty = false;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(thumbnail, 0, 0);
    const b = api.viewport.getBoundingClientRect();
    const points = [
      [b.left, b.top],
      [b.right, b.top],
      [b.right, b.bottom],
      [b.left, b.bottom],
    ].map(([sx, sy]) => api.screenToCanvas(sx, sy));
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, state.width * scale, state.height * scale);
    ctx.clip();
    ctx.strokeStyle = "#ff8a24";
    ctx.fillStyle = "#ff8a2426";
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((p, i) => {
      const px = x + p.x * scale,
        py = y + p.y * scale;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    $("navigator-zoom").value = state.zoom * 100;
    $("navigator-zoom-value").textContent = `${Math.round(state.zoom * 100)}%`;
    $("navigator-rotation").textContent = `${Math.round(state.rotation)}°`;
  }
  function scene() {
    sceneDirty = true;
    if (!timer && !$("navigator-panel").hidden)
      timer = setTimeout(() => {
        timer = null;
        render();
      }, 180);
  }
  function center(event) {
    const b = canvas.getBoundingClientRect(),
      g = geometry();
    api.centerOn({
      x: Math.max(
        0,
        Math.min(
          state.width,
          (((event.clientX - b.left) * canvas.width) / b.width - g.x) / g.scale,
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          state.height,
          (((event.clientY - b.top) * canvas.height) / b.height - g.y) /
            g.scale,
        ),
      ),
    });
  }
  function open() {
    $("navigator-panel").hidden = false;
    sceneDirty = true;
    render();
    $("navigator-close").focus();
  }
  $("navigator-close").addEventListener("click", () => {
    $("navigator-panel").hidden = true;
  });
  canvas.addEventListener("pointerdown", (event) => {
    if (state.drawing || state.gesture) return;
    event.preventDefault();
    dragging = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    center(event);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (dragging === event.pointerId) center(event);
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    canvas.addEventListener(type, () => (dragging = null));
  canvas.addEventListener("keydown", (event) => {
    const delta = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[event.key];
    if (!delta || state.drawing || state.gesture) return;
    event.preventDefault();
    event.stopPropagation();
    const b = api.viewport.getBoundingClientRect(),
      p = api.screenToCanvas(b.left + b.width / 2, b.top + b.height / 2);
    api.centerOn({
      x: p.x + ((delta[0] * b.width) / state.zoom) * 0.15,
      y: p.y + ((delta[1] * b.height) / state.zoom) * 0.15,
    });
  });
  $("navigator-fit").addEventListener("click", () => {
    if (!state.drawing && !state.gesture) api.fitCanvas();
  });
  $("navigator-zoom").addEventListener("input", () => {
    if (!state.drawing && !state.gesture)
      api.zoomBy(Number($("navigator-zoom").value) / 100 / state.zoom);
  });
  return { open, scene, view: render, refreshLanguage: render };
}
