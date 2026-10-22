import { brushSegment } from "./engine.js";
import { runFill } from "./fill-client.js";
import { renderScene, surface } from "./canvas.js";
const series = new Map();
export function measure(name, milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return;
  const values = series.get(name) || [];
  values.push(milliseconds);
  if (values.length > 128) values.shift();
  series.set(name, values);
}
export function metricSummary() {
  return Object.fromEntries(
    [...series].map(([name, values]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return [
        name,
        {
          samples: values.length,
          medianMs: sorted[Math.floor(sorted.length * 0.5)],
          p95Ms:
            sorted[
              Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))
            ],
        },
      ];
    }),
  );
}
export function memoryEstimate(state) {
  const canvases = new Set(),
    images = new Set();
  for (const layer of state.layers)
    for (const key of ["canvas", "mask", "_masked", "_clipped", "_adjusted"])
      if (layer[key]) canvases.add(layer[key]);
  for (const group of state.groups)
    if (group._surface) canvases.add(group._surface);
  for (const entry of state.history)
    for (const layer of entry.layers)
      for (const value of [layer.image, layer.mask])
        if (value) images.add(value);
  return {
    canvasBytes:
      [...canvases].reduce((n, c) => n + c.width * c.height * 4, 0) +
      state.width * state.height * 4,
    historyEncodedBytes: [...images].reduce((n, v) => n + v.length * 2, 0),
    surfaces: canvases.size + 1,
  };
}
export function initMetrics(api) {
  const { $, state, t } = api;
  let running = false,
    timer,
    benchmark = null;
  const names = {
    render: "metricRender",
    brush: "metricBrush",
    fill: "metricFill",
    inputToFrame: "metricInput",
  };
  function report() {
    return {
      format: "drawsketch-performance",
      version: 1,
      appVersion: __APP_VERSION__,
      createdAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      canvas: {
        width: state.width,
        height: state.height,
        layers: state.layers.length,
      },
      measurements: metricSummary(),
      memoryEstimate: memoryEstimate(state),
      jsHeapBytes: performance.memory?.usedJSHeapSize ?? null,
      benchmark,
      notes:
        "Software timing and estimates only; excludes hardware latency and additional GPU/native allocations.",
    };
  }
  function render() {
    $("performance-list").replaceChildren();
    for (const [name, value] of Object.entries(metricSummary())) {
      const row = document.createElement("p");
      row.textContent = t("metricRow", {
        name: t(names[name] || "metricRender"),
        n: value.samples,
        median: value.medianMs.toFixed(2),
        p95: value.p95Ms.toFixed(2),
      });
      $("performance-list").append(row);
    }
    const memory = memoryEstimate(state);
    $("performance-memory").textContent = t("metricMemory", {
      canvas: (memory.canvasBytes / 1e6).toFixed(1),
      history: (memory.historyEncodedBytes / 1e6).toFixed(1),
      n: memory.surfaces,
    });
    $("benchmark-run").disabled = running;
    $("benchmark-result").textContent = running
      ? t("benchmarkRunning")
      : benchmark
        ? t("benchmarkResult", {
            brush: benchmark.brushMs.toFixed(1),
            fill: benchmark.fillMs.toFixed(1),
            render: benchmark.renderMs.toFixed(1),
          })
        : t("benchmarkEmpty");
  }
  function open() {
    render();
    $("performance-dialog").showModal();
    clearInterval(timer);
    timer = setInterval(render, 600);
  }
  $("performance-dialog").addEventListener("close", () => clearInterval(timer));
  $("performance-export").addEventListener("click", () =>
    api.download(
      new Blob([JSON.stringify(report(), null, 2)], {
        type: "application/json",
      }),
      "performance.json",
    ),
  );
  $("performance-reset").addEventListener("click", () => {
    series.clear();
    benchmark = null;
    render();
  });
  $("benchmark-run").addEventListener("click", async () => {
    if (running) return;
    running = true;
    render();
    try {
      await new Promise((r) => requestAnimationFrame(r));
      const canvas = surface(640, 480),
        ctx = canvas.getContext("2d"),
        start = performance.now();
      for (let i = 0; i < 400; i++)
        brushSegment(
          ctx,
          { x: i % 600, y: 30 + (i % 400), pressure: 0.4 },
          { x: 1 + (i % 600), y: 31 + (i % 400), pressure: 0.8 },
          {
            brush: "ink",
            size: 15,
            opacity: 100,
            color: "#ff8a24",
            pressure: true,
          },
        );
      const brushMs = performance.now() - start;
      await new Promise((r) => setTimeout(r, 0));
      const fillStart = performance.now();
      await runFill(
        ctx.getImageData(0, 0, 640, 480),
        { x: 639, y: 479 },
        { color: "#112233", opacity: 100, tolerance: 0 },
      );
      const fillMs = performance.now() - fillStart;
      const layers = Array.from({ length: 8 }, (_, i) => ({
          id: String(i),
          canvas,
          visible: true,
          opacity: 0.5,
          blend: "source-over",
        })),
        output = surface(640, 480),
        renderStart = performance.now();
      for (let i = 0; i < 10; i++)
        renderScene(output.getContext("2d"), layers, [], 640, 480);
      benchmark = {
        brushMs,
        fillMs,
        renderMs: (performance.now() - renderStart) / 10,
        fixture: {
          width: 640,
          height: 480,
          layers: 8,
          segments: 400,
          renders: 10,
        },
      };
    } catch {
      api.toast("benchmarkError");
    } finally {
      running = false;
      render();
    }
  });
  return { open, report, refreshLanguage: render };
}
