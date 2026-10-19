import { brushSegment } from "./engine.js";
export function initDiagnostics(api) {
  const { $, t, settings } = api,
    canvas = $("diagnostics-canvas"),
    ctx = canvas.getContext("2d");
  let drawing = null,
    pen = false,
    samples = 0,
    min = 1,
    max = 0,
    pointer = "—",
    pressure = 0,
    tiltX = 0,
    tiltY = 0,
    ignoredTouches = 0;
  function render() {
    $("diagnostics-values").textContent = t("diagnosticsValues", {
      pointer: ["pen", "mouse", "touch"].includes(pointer)
        ? t("input" + pointer)
        : pointer,
      pressure: pressure.toFixed(2),
      tiltX,
      tiltY,
      n: samples,
      min: samples ? min.toFixed(2) : "—",
      max: samples ? max.toFixed(2) : "—",
      ignored: ignoredTouches,
    });
  }
  const point = (event) => {
    const b = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - b.left) * canvas.width) / b.width,
      y: ((event.clientY - b.top) * canvas.height) / b.height,
      pressure: event.pointerType === "pen" ? event.pressure : 0.65,
      tiltX: event.tiltX,
      tiltY: event.tiltY,
    };
  };
  function observe(event) {
    pointer = event.pointerType;
    pressure = event.pressure;
    tiltX = event.tiltX;
    tiltY = event.tiltY;
    if (event.pointerType === "pen" && event.pressure > 0) {
      samples++;
      min = Math.min(min, pressure);
      max = Math.max(max, pressure);
    }
    render();
  }
  function paint(from, to) {
    brushSegment(ctx, from, to, {
      brush: "ink",
      size: 18,
      opacity: 100,
      color: "#ff8a24",
      pressure: settings.pressure,
      pressureCurve: settings.pressureCurve,
      tilt: settings.tilt,
    });
  }
  canvas.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    if (event.pointerType === "touch" && pen) {
      ignoredTouches++;
      render();
      return;
    }
    if (event.pointerType === "pen") pen = true;
    if (drawing && event.pointerType !== "pen") return;
    observe(event);
    drawing = { id: event.pointerId, last: point(event) };
    canvas.setPointerCapture(event.pointerId);
    paint(drawing.last, drawing.last);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch" && pen) {
      ignoredTouches++;
      render();
      return;
    }
    observe(event);
    if (drawing?.id !== event.pointerId) return;
    const entries = event.getCoalescedEvents?.();
    for (const entry of entries?.length ? entries : [event]) {
      const next = point(entry);
      paint(drawing.last, next);
      drawing.last = next;
    }
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    canvas.addEventListener(type, (event) => {
      if (event.pointerType === "pen") pen = false;
      if (drawing?.id === event.pointerId) drawing = null;
    });
  $("diagnostics-reset").addEventListener("click", () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    samples = 0;
    min = 1;
    max = 0;
    ignoredTouches = 0;
    render();
  });
  $("diagnostics-open").addEventListener("click", () => {
    $("settings-dialog").close();
    render();
    $("diagnostics-dialog").showModal();
  });
  $("diagnostics-dialog").addEventListener("close", () => {
    drawing = null;
    pen = false;
  });
  $("diagnostics-export").addEventListener("click", () =>
    api.download(
      new Blob(
        [
          JSON.stringify(
            {
              format: "drawsketch-input-diagnostics",
              version: 1,
              appVersion: __APP_VERSION__,
              createdAt: new Date().toISOString(),
              device: $("diagnostics-device").value,
              pen: $("diagnostics-pen").value,
              userAgent: navigator.userAgent,
              viewport: {
                width: innerWidth,
                height: innerHeight,
                pixelRatio: devicePixelRatio,
              },
              penSamples: samples,
              pressureMin: samples ? min : null,
              pressureMax: samples ? max : null,
              ignoredTouches,
              lastInput: { pointer, pressure, tiltX, tiltY },
              pressureCurve: settings.pressureCurve,
              hardwareCertification: "not-established-by-this-report",
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
      "input-report.json",
    ),
  );
  return { refreshLanguage: render };
}
