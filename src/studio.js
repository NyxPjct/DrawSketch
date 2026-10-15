import { surface, clone, dirty, assignGroup } from "./canvas.js";
import { listDocuments, listVersions, importDocuments } from "./storage.js";
import { applyTranslations } from "./i18n.js";
import { brushPresets } from "./engine.js";

export function initStudio(api) {
  const { state, settings, selection, $, t } = api;
  let hold = null,
    custom = [];
  try {
    custom = JSON.parse(localStorage.getItem("drawsketch.brushes.v1") || "[]");
    if (!Array.isArray(custom)) custom = [];
    custom = custom
      .filter(
        (item) =>
          typeof item.name === "string" &&
          item.name.length <= 50 &&
          Object.hasOwn(brushPresets, item.brush) &&
          Number.isFinite(item.size) &&
          item.size >= 1 &&
          item.size <= 160 &&
          Number.isFinite(item.opacity) &&
          item.opacity >= 1 &&
          item.opacity <= 100,
      )
      .slice(0, 32);
  } catch {}
  const currentGroup = () =>
    state.groups.find((group) => group.id === api.activeLayer()?.groupId);
  const visibleLayer = () => {
    const layer = api.activeLayer(),
      group = currentGroup();
    return (
      layer &&
      !layer.locked &&
      layer.visible &&
      layer.opacity > 0 &&
      (!group || (group.visible && group.opacity > 0))
    );
  };
  const mutable = () => api.canEdit() && visibleLayer();
  const outline = () => {
    selection.outline($("selection-overlay").getContext("2d"));
    $("selection-actions").hidden =
      !selection.path && !["select", "lasso", "move"].includes(state.tool);
  };
  function cancelFloat() {
    selection.floating = null;
    api.render();
  }
  function applyFloat() {
    const target = selection.apply();
    if (target) {
      dirty(target);
      api.commit();
    }
    outline();
  }
  function beginTransform() {
    if (!mutable()) {
      api.toast("errorLayer");
      return;
    }
    selection.begin(api.paintTarget());
    const f = selection.floating;
    if (!f) return;
    for (const [id, key] of [
      ["transform-x", "x"],
      ["transform-y", "y"],
      ["transform-width", "width"],
      ["transform-height", "height"],
      ["transform-angle", "rotation"],
    ])
      $(id).value = Math.round(f[key]);
    $("transform-flip-x").checked = f.flipX;
    $("transform-flip-y").checked = f.flipY;
    $("transform-dialog").showModal();
    api.render();
    outline();
  }
  for (const [id, key] of [
    ["transform-x", "x"],
    ["transform-y", "y"],
    ["transform-width", "width"],
    ["transform-height", "height"],
    ["transform-angle", "rotation"],
  ])
    $(id).addEventListener("input", () => {
      const f = selection.floating,
        value = Number($(id).value);
      if (!f || !Number.isFinite(value)) return;
      if ((key === "width" || key === "height") && (value < 1 || value > 32768))
        return;
      if (Math.abs(value) > 32768) return;
      f[key] = value;
      api.render();
    });
  for (const [id, key] of [
    ["transform-flip-x", "flipX"],
    ["transform-flip-y", "flipY"],
  ])
    $(id).addEventListener("change", () => {
      if (selection.floating) {
        selection.floating[key] = $(id).checked;
        api.render();
      }
    });
  $("transform-apply").addEventListener("click", () => {
    applyFloat();
    $("transform-dialog").close();
  });
  $("transform-cancel").addEventListener("click", () => {
    cancelFloat();
    $("transform-dialog").close();
  });
  $("transform-dialog").addEventListener("close", () => {
    if (selection.floating) cancelFloat();
  });
  $("selection-all").addEventListener("click", () => {
    if (api.canEdit()) {
      selection.all();
      outline();
    }
  });
  $("selection-none").addEventListener("click", () => {
    if (selection.floating) cancelFloat();
    selection.clear();
    outline();
    api.render();
  });
  $("selection-transform").addEventListener("click", beginTransform);
  $("selection-erase").addEventListener("click", () => {
    if (!mutable()) {
      api.toast("errorLayer");
      return;
    }
    if (!selection.path) {
      api.toast("selectionEmpty");
      return;
    }
    const target = api.paintTarget();
    selection.erase(target);
    dirty(target);
    api.commit();
    outline();
  });

  // Non-destructive layer controls.
  $("alpha-lock").addEventListener("change", () => {
    if (api.canEdit()) {
      api.activeLayer().alphaLock = $("alpha-lock").checked;
      api.commit();
    }
  });
  $("clipping").addEventListener("change", () => {
    if (api.canEdit()) {
      api.activeLayer().clipping = $("clipping").checked;
      api.commit();
    }
  });
  $("add-mask").addEventListener("click", () => {
    if (!mutable()) return;
    const layer = api.activeLayer();
    if (layer.mask) return;
    layer.mask = surface(state.width, state.height);
    const ctx = layer.mask.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, state.width, state.height);
    dirty(layer.mask);
    layer.maskEnabled = true;
    state.editMask = true;
    api.setColor("#000000");
    api.commit();
  });
  $("edit-mask").addEventListener("click", () => {
    if (api.canEdit() && api.activeLayer().mask) {
      state.editMask = !state.editMask;
      api.renderLayers();
      if (state.editMask) api.setColor("#000000");
    }
  });
  $("remove-mask").addEventListener("click", () => {
    if (!mutable()) return;
    api.activeLayer().mask = null;
    state.editMask = false;
    api.commit();
  });
  $("mask-enabled").addEventListener("change", () => {
    if (api.canEdit()) {
      api.activeLayer().maskEnabled = $("mask-enabled").checked;
      api.commit();
    }
  });
  $("invert-mask").addEventListener("click", () => {
    if (!mutable() || !api.activeLayer().mask) return;
    const mask = api.activeLayer().mask,
      ctx = mask.getContext("2d"),
      image = ctx.getImageData(0, 0, state.width, state.height);
    for (let i = 0; i < image.data.length; i += 4) {
      image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
      image.data[i + 3] = 255 - image.data[i + 3];
    }
    ctx.putImageData(image, 0, 0);
    dirty(mask);
    api.commit();
  });
  $("new-group").addEventListener("click", () => {
    if (!api.canEdit()) return;
    const group = {
      id: crypto.randomUUID(),
      name: "",
      nameKey: "groupDefault",
      nameParams: { n: state.groups.length + 1 },
      opacity: 1,
      visible: true,
    };
    state.groups.push(group);
    assignGroup(state.layers, api.activeLayer(), group.id);
    api.commit();
  });
  $("layer-group").addEventListener("change", () => {
    if (api.canEdit()) {
      assignGroup(state.layers, api.activeLayer(), $("layer-group").value);
      api.commit();
    }
  });
  $("group-opacity").addEventListener("input", () => {
    const group = currentGroup();
    if (api.canEdit() && group) {
      group.opacity = Number($("group-opacity").value) / 100;
      $("group-opacity-value").textContent = `${$("group-opacity").value}%`;
      api.render();
    }
  });
  $("group-opacity").addEventListener("change", () => {
    if (api.canEdit() && currentGroup()) api.commit();
  });
  $("group-visible").addEventListener("change", () => {
    if (api.canEdit() && currentGroup()) {
      currentGroup().visible = $("group-visible").checked;
      api.commit();
    }
  });
  $("rename-group").addEventListener("click", () => {
    if (!api.canEdit() || !currentGroup()) return;
    controller.renameGroup = currentGroup().id;
    $("rename-dialog").querySelector("h2").dataset.i18n = "groupName";
    $("rename-form").querySelector(".form-label>span").dataset.i18n =
      "groupName";
    $("layer-name-input").value = api.nameOf(currentGroup());
    applyTranslations();
    $("rename-dialog").showModal();
  });

  // Brush parameters and named, persisted presets.
  function renderCustom() {
    $("custom-brush-list").replaceChildren();
    for (const entry of custom) {
      const row = document.createElement("div");
      row.className = "custom-brush-item";
      const use = document.createElement("button");
      use.textContent = entry.name;
      use.addEventListener("click", () => {
        api.selectBrush(entry.brush);
        state.size = entry.size;
        state.opacity = entry.opacity;
        settings.texture = ["none", "grain", "canvas"].includes(entry.texture)
          ? entry.texture
          : "none";
        settings.textureStrength = clamp(entry.textureStrength, 0, 100, 35);
        settings.colorMix = clamp(entry.colorMix, 0, 100, 0);
        settings.stabilization = clamp(entry.stabilization, 0, 80, 0);
        settings.tilt = entry.tilt !== false;
        api.persistSettings();
        api.syncBrush();
      });
      const remove = document.createElement("button");
      remove.textContent = "×";
      remove.setAttribute("aria-label", `${t("deleteBrush")} ${entry.name}`);
      remove.addEventListener("click", () => {
        custom = custom.filter((item) => item.id !== entry.id);
        storeBrushes();
        renderCustom();
        api.toast("brushDeleted");
      });
      row.append(use, remove);
      $("custom-brush-list").append(row);
    }
  }
  function storeBrushes() {
    try {
      localStorage.setItem("drawsketch.brushes.v1", JSON.stringify(custom));
    } catch {
      api.toast("errorSave");
    }
  }
  $("paper-texture").addEventListener("change", () => {
    settings.texture = $("paper-texture").value;
    api.persistSettings();
    api.syncBrush();
  });
  for (const [id, key] of [
    ["texture-strength", "textureStrength"],
    ["color-mix", "colorMix"],
  ])
    $(id).addEventListener("input", () => {
      settings[key] = Number($(id).value);
      api.persistSettings();
      api.syncBrush();
    });
  $("tilt-setting").addEventListener("change", () => {
    settings.tilt = $("tilt-setting").checked;
    api.persistSettings();
    api.syncBrush();
  });
  $("save-brush").addEventListener("click", () => {
    const name = $("custom-brush-name").value.trim().slice(0, 50);
    if (!name) {
      api.toast("errorBrush");
      return;
    }
    if (custom.length >= 32) custom.shift();
    custom.push({
      id: crypto.randomUUID(),
      name,
      brush: state.brush,
      size: state.size,
      opacity: state.opacity,
      texture: settings.texture,
      textureStrength: settings.textureStrength,
      colorMix: settings.colorMix,
      stabilization: settings.stabilization,
      tilt: settings.tilt,
    });
    storeBrushes();
    renderCustom();
    api.toast("brushSaved");
  });

  // Version recovery always opens a copy, so restoring never overwrites the current canvas.
  async function renderVersions() {
    $("version-list").replaceChildren();
    try {
      const records = await listVersions(state.id);
      if (!records.length) {
        const p = document.createElement("p");
        p.textContent = t("versionEmpty");
        $("version-list").append(p);
      }
      for (const version of records) {
        const button = document.createElement("button");
        const date = new Intl.DateTimeFormat(api.getLanguage(), {
          dateStyle: "medium",
          timeStyle: "medium",
        }).format(version.createdAt);
        button.textContent = t("restoreVersion", { date });
        button.addEventListener("click", async () => {
          if (!api.canEdit() || !(await api.saveLocal(true))) return;
          state.busy = true;
          try {
            await api.restore({ ...version.data, id: crypto.randomUUID() });
            state.history = [];
            state.historyIndex = -1;
            api.commit();
            api.fitCanvas();
            $("versions-dialog").close();
            api.toast("versionRestored");
          } catch {
            api.toast("errorProject");
          } finally {
            state.busy = false;
            api.updateHistoryButtons();
          }
        });
        $("version-list").append(button);
      }
    } catch {
      api.toast("errorGallery");
    }
  }
  $("versions-open").addEventListener("click", async () => {
    if (!api.canEdit()) return;
    await api.saveLocal();
    $("gallery-dialog").close();
    await renderVersions();
    $("versions-dialog").showModal();
  });
  $("checkpoint-now").addEventListener("click", async () => {
    if (api.canEdit() && (await api.saveLocal(true))) {
      await renderVersions();
      api.toast("versionSaved");
    }
  });
  $("export-backup").addEventListener("click", async () => {
    if (!api.canEdit() || !(await api.saveLocal())) return;
    try {
      const records = await listDocuments();
      api.download(
        new Blob(
          [
            JSON.stringify({
              format: "drawsketch-backup",
              version: 1,
              createdAt: new Date().toISOString(),
              documents: records,
            }),
          ],
          { type: "application/json" },
        ),
        "drawsketch-backup",
      );
      api.toast("backupSaved");
    } catch {
      api.toast("errorGallery");
    }
  });
  $("import-backup").addEventListener("click", () => {
    if (api.canEdit()) $("backup-file").click();
  });
  $("backup-file").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file || !api.canEdit()) return;
    if (file.size > 100_000_000) {
      api.toast("backupLarge");
      return;
    }
    state.busy = true;
    try {
      const backup = JSON.parse(await file.text());
      if (
        backup.format !== "drawsketch-backup" ||
        backup.version !== 1 ||
        !Array.isArray(backup.documents) ||
        backup.documents.length > 100 ||
        backup.documents.some((record) => !api.validProject(record.data))
      )
        throw new Error("Invalid backup");
      for (const record of backup.documents)
        for (const layer of record.data.layers)
          for (const value of [layer.image, layer.mask].filter(Boolean)) {
            const image = new Image();
            image.src = value;
            await image.decode();
            if (
              image.naturalWidth !== record.data.width ||
              image.naturalHeight !== record.data.height
            )
              throw new Error("Invalid image dimensions");
          }
      const records = backup.documents.map((record) => {
        const id = crypto.randomUUID();
        return {
          id,
          title: record.data.title,
          updatedAt: Date.now(),
          thumbnail: /^data:image\/(png|webp);base64,/.test(
            record.thumbnail || "",
          )
            ? record.thumbnail
            : "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aKZkAAAAASUVORK5CYII=",
          data: { ...record.data, id },
        };
      });
      await importDocuments(records);
      await api.renderGallery();
      api.toast("backupImported", { n: records.length });
    } catch {
      api.toast("backupError");
    } finally {
      state.busy = false;
      api.updateHistoryButtons();
    }
  });

  const controller = {
    renameGroup: null,
    syncLayers() {
      const layer = api.activeLayer();
      if (!layer) return;
      const group = currentGroup();
      $("alpha-lock").checked = layer.alphaLock;
      $("clipping").checked = layer.clipping;
      $("add-mask").disabled = !!layer.mask;
      for (const id of [
        "edit-mask",
        "invert-mask",
        "remove-mask",
        "mask-enabled",
      ])
        $(id).disabled = !layer.mask;
      $("edit-mask").setAttribute("aria-pressed", String(state.editMask));
      $("mask-enabled").checked = layer.maskEnabled;
      const select = $("layer-group");
      select.replaceChildren();
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = t("ungrouped");
      select.append(empty);
      for (const group of state.groups) {
        const option = document.createElement("option");
        option.value = group.id;
        option.textContent = api.nameOf(group);
        select.append(option);
      }
      select.value = layer.groupId || "";
      for (const id of ["group-opacity", "group-visible", "rename-group"])
        $(id).disabled = !group;
      $("group-opacity").value = Math.round((group?.opacity ?? 1) * 100);
      $("group-opacity-value").textContent = `${$("group-opacity").value}%`;
      $("group-visible").checked = group?.visible ?? true;
    },
    syncBrush() {
      $("paper-texture").value = settings.texture;
      $("texture-strength").value = settings.textureStrength;
      $("texture-strength-value").textContent = `${settings.textureStrength}%`;
      $("color-mix").value = settings.colorMix;
      $("color-mix-value").textContent = `${settings.colorMix}%`;
      $("tilt-setting").checked = settings.tilt;
    },
    refreshLanguage() {
      renderCustom();
      if ($("versions-dialog").open) renderVersions();
    },
    selectionDown(event, p) {
      if (!["select", "lasso", "move"].includes(state.tool)) return false;
      if (state.tool === "move") {
        if (!visibleLayer()) {
          api.toast("errorLayer");
          return true;
        }
        selection.begin(api.paintTarget());
        if (!selection.floating) return true;
        state.drawing = {
          type: "move",
          pointerId: event.pointerId,
          start: p,
          x: selection.floating.x,
          y: selection.floating.y,
        };
      } else {
        selection.clear();
        state.drawing = {
          type: state.tool,
          pointerId: event.pointerId,
          start: p,
          points: [p],
        };
      }
      outline();
      return true;
    },
    selectionMove(event, p) {
      const drawing = state.drawing;
      if (
        !drawing ||
        drawing.pointerId !== event.pointerId ||
        !["select", "lasso", "move"].includes(drawing.type)
      )
        return false;
      if (drawing.type === "move") {
        selection.floating.x = drawing.x + p.x - drawing.start.x;
        selection.floating.y = drawing.y + p.y - drawing.start.y;
        api.render();
      } else if (drawing.type === "select") {
        selection.rectangle(drawing.start, p);
        outline();
      } else {
        if (
          Math.hypot(
            p.x - drawing.points.at(-1).x,
            p.y - drawing.points.at(-1).y,
          ) > 1
        ) {
          if (drawing.points.length >= 4096)
            drawing.points = drawing.points.filter((_, i) => i % 2 === 0);
          drawing.points.push(p);
        }
        selection.lasso(drawing.points);
        outline();
      }
      return true;
    },
    selectionUp(event, cancel) {
      const drawing = state.drawing;
      if (
        !drawing ||
        drawing.pointerId !== event.pointerId ||
        !["select", "lasso", "move"].includes(drawing.type)
      )
        return false;
      state.drawing = null;
      if (cancel) {
        cancelFloat();
        selection.clear();
      } else if (drawing.type === "move") applyFloat();
      outline();
      if (api.viewport.hasPointerCapture(event.pointerId))
        api.viewport.releasePointerCapture(event.pointerId);
      return true;
    },
    startHold(event) {
      this.cancelHold();
      const captured = {
        clientX: event.clientX,
        clientY: event.clientY,
        pointerId: event.pointerId,
        pointerType: "touch",
      };
      hold = {
        ...captured,
        timer: setTimeout(() => {
          if (state.drawing?.pointerId !== captured.pointerId) return;
          api.cancelDrawing();
          api.selectTool("eyedropper");
          api.tapAction(captured);
        }, 500),
      };
    },
    moveHold(event) {
      if (
        hold &&
        Math.hypot(event.clientX - hold.clientX, event.clientY - hold.clientY) >
          5
      )
        this.cancelHold();
    },
    cancelHold() {
      if (hold) clearTimeout(hold.timer);
      hold = null;
    },
  };
  renderCustom();
  return controller;
}
function clamp(value, min, max, fallback) {
  return Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}
