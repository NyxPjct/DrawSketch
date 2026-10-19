import { brushPresets, brushSegment } from "./engine.js";
import {
  brushCategories,
  normalizePreset,
  parseBrushLibrary,
} from "./brush-model.js";

export function initBrushLibrary(api) {
  const { $, state, settings, t } = api;
  let custom = [];
  try {
    const stored = JSON.parse(
      localStorage.getItem("drawsketch.brushes.v1") || "[]",
    );
    if (Array.isArray(stored))
      custom = stored.slice(0, 32).flatMap((item) => {
        try {
          return [normalizePreset(item, brushPresets)];
        } catch {
          return [];
        }
      });
  } catch {}
  function store(next) {
    try {
      localStorage.setItem("drawsketch.brushes.v1", JSON.stringify(next));
      custom = next;
      return true;
    } catch {
      api.toast("errorSave");
      return false;
    }
  }
  function render() {
    const category = $("brush-category-filter").value;
    const query = $("brush-search").value.trim().toLocaleLowerCase();
    $("custom-brush-list").replaceChildren();
    for (const button of document.querySelectorAll(
      "#brush-dialog [data-brush]",
    )) {
      button.hidden =
        (category !== "all" &&
          brushCategories[button.dataset.brush] !== category) ||
        !t(button.dataset.brush).toLocaleLowerCase().includes(query);
    }
    let count = 0;
    for (const entry of custom) {
      if (
        (category !== "all" && entry.category !== category) ||
        !entry.name.toLocaleLowerCase().includes(query)
      )
        continue;
      count++;
      const row = document.createElement("div");
      row.className = "custom-brush-item";
      const use = document.createElement("button");
      use.textContent = entry.name;
      use.addEventListener("click", () => {
        if (!api.canEdit()) return;
        api.selectBrush(entry.brush);
        state.size = entry.size;
        state.opacity = entry.opacity;
        for (const key of [
          "texture",
          "textureStrength",
          "colorMix",
          "stabilization",
          "tilt",
          "pressure",
        ])
          settings[key] = entry[key];
        settings.pressureCurve = [...entry.pressureCurve];
        $("pressure-setting").checked = settings.pressure;
        api.persistSettings();
        api.syncBrush();
      });
      const remove = document.createElement("button");
      remove.textContent = "×";
      remove.setAttribute("aria-label", `${t("deleteBrush")} ${entry.name}`);
      remove.addEventListener("click", () => {
        if (store(custom.filter((item) => item.id !== entry.id))) {
          render();
          api.toast("brushDeleted");
        }
      });
      row.append(use, remove);
      $("custom-brush-list").append(row);
    }
    $("brush-library-count").textContent = t("presetCount", {
      n: count,
      total: custom.length,
    });
    $("export-brushes").disabled = !custom.length;
  }
  function sync() {
    for (let i = 1; i < 4; i++) {
      $("pressure-point-" + i).value = Math.round(
        settings.pressureCurve[i] * 100,
      );
      $("pressure-point-value-" + i).textContent =
        `${Math.round(settings.pressureCurve[i] * 100)}%`;
    }
    const graph = $("pressure-curve").getContext("2d");
    graph.clearRect(0, 0, 300, 110);
    graph.strokeStyle = "#8d847d";
    graph.lineWidth = 1;
    graph.beginPath();
    graph.moveTo(15, 10);
    graph.lineTo(15, 95);
    graph.lineTo(285, 95);
    graph.stroke();
    graph.strokeStyle = "#ff8a24";
    graph.lineWidth = 3;
    graph.beginPath();
    settings.pressureCurve.forEach((v, i) =>
      graph.lineTo(15 + i * 67.5, 95 - v * 80),
    );
    graph.stroke();
    const ctx = $("live-brush-preview").getContext("2d");
    ctx.clearRect(0, 0, 480, 110);
    let previous = { x: 20, y: 60, pressure: 0.05 };
    for (let i = 1; i <= 90; i++) {
      const p = {
        x: 20 + (i * 440) / 90,
        y: 55 - Math.sin((i / 90) * Math.PI * 2) * 22,
        pressure: 0.05 + Math.sin((i / 90) * Math.PI) * 0.95,
        tiltX: 20,
        tiltY: 10,
      };
      brushSegment(ctx, previous, p, {
        brush: state.brush,
        size: Math.min(60, state.size),
        opacity: state.opacity,
        color: state.color,
        pressure: settings.pressure,
        pressureCurve: settings.pressureCurve,
        texture: settings.texture,
        textureStrength: settings.textureStrength,
        tilt: settings.tilt,
      });
      previous = p;
    }
  }
  for (let i = 1; i < 4; i++)
    $("pressure-point-" + i).addEventListener("input", () => {
      settings.pressureCurve[i] = Math.max(
        settings.pressureCurve[i - 1],
        Math.min(
          settings.pressureCurve[i + 1],
          Number($("pressure-point-" + i).value) / 100,
        ),
      );
      api.persistSettings();
      api.syncBrush();
    });
  $("pressure-preset").addEventListener("change", () => {
    const exponent = { soft: 0.5, linear: 1, firm: 2 }[
      $("pressure-preset").value
    ];
    settings.pressureCurve = [0, 0.25, 0.5, 0.75, 1].map((p) => p ** exponent);
    api.persistSettings();
    api.syncBrush();
  });
  $("brush-category-filter").addEventListener("change", render);
  $("brush-search").addEventListener("input", render);
  $("save-brush").addEventListener("click", () => {
    const name = $("custom-brush-name").value.trim().slice(0, 50);
    if (!name) return api.toast("errorBrush");
    if (custom.length >= 32) return api.toast("brushLibraryFull");
    const entry = normalizePreset(
      {
        ...settings,
        name,
        brush: state.brush,
        size: state.size,
        opacity: state.opacity,
        category: $("custom-brush-category").value,
      },
      brushPresets,
    );
    if (store([...custom, entry])) {
      $("brush-category-filter").value = "all";
      $("brush-search").value = "";
      render();
      api.toast("brushSaved");
    }
  });
  $("export-brushes").addEventListener("click", () =>
    api.download(
      new Blob(
        [
          JSON.stringify({
            format: "drawsketch-brushes",
            version: 1,
            brushes: custom,
          }),
        ],
        { type: "application/json" },
      ),
      "drawsketch-brushes",
    ),
  );
  $("import-brushes").addEventListener("click", () =>
    $("brushes-file").click(),
  );
  $("brushes-file").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error("Too large");
      const imported = parseBrushLibrary(
        JSON.parse(await file.text()),
        brushPresets,
      );
      if (custom.length + imported.length > 32)
        return api.toast("brushLibraryFull");
      if (store([...custom, ...imported])) {
        render();
        api.toast("brushesImported", { n: imported.length });
      }
    } catch {
      api.toast("brushImportError");
    }
  });
  render();
  return { sync, refreshLanguage: render };
}
