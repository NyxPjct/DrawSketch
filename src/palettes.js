import { extractColors, validHex } from "./color-model.js";
export function initPalettes(api) {
  const { $, state, t } = api;
  const current = () =>
    state.palettes.find((p) => p.id === $("palette-select").value) ||
    state.palettes[0];
  const nameOf = (p) =>
    p.name || t("paletteDefault", { n: state.palettes.indexOf(p) + 1 });
  function render() {
    const selected = $("palette-select").value;
    $("palette-select").replaceChildren();
    for (const p of state.palettes) {
      const o = document.createElement("option");
      o.value = p.id;
      o.textContent = nameOf(p);
      $("palette-select").append(o);
    }
    if (state.palettes.some((p) => p.id === selected))
      $("palette-select").value = selected;
    const p = current(),
      filter = $("palette-favorites-only").checked,
      colors = filter ? state.favoriteColors : p?.colors || [];
    $("palette-colors").replaceChildren();
    for (const color of colors) {
      const button = document.createElement("button");
      button.className = "project-swatch";
      button.style.backgroundColor = color;
      button.setAttribute("aria-label", t("swatch", { color }));
      button.title = color;
      button.setAttribute("aria-pressed", String(color === state.color));
      if (state.favoriteColors.includes(color)) {
        const star = document.createElement("span");
        star.textContent = "★";
        star.setAttribute("aria-hidden", "true");
        button.append(star);
      }
      button.addEventListener("click", () => {
        api.setColor(color);
        render();
      });
      $("palette-colors").append(button);
    }
    $("palette-empty").hidden = !!colors.length;
    $("palette-count").textContent = t("paletteCount", {
      n: p?.colors.length || 0,
      max: 32,
    });
    $("palette-add-color").disabled =
      !p || p.colors.length >= 32 || p.colors.includes(state.color);
    $("palette-remove-color").disabled = !p || !p.colors.includes(state.color);
    for (const id of ["palette-rename", "palette-delete"]) $(id).disabled = !p;
    $("palette-star").setAttribute(
      "aria-pressed",
      String(state.favoriteColors.includes(state.color)),
    );
    $("palette-create").disabled = state.palettes.length >= 8;
  }
  function save() {
    api.commit();
    render();
  }
  function open() {
    if (api.canEdit()) {
      render();
      $("palettes-dialog").showModal();
    }
  }
  $("palette-select").addEventListener("change", render);
  $("palette-favorites-only").addEventListener("change", render);
  $("palette-create").addEventListener("click", () => {
    if (!api.canEdit() || state.palettes.length >= 8) return;
    const p = {
      id: crypto.randomUUID(),
      name: $("palette-name").value.trim().slice(0, 50),
      colors: [],
    };
    state.palettes.push(p);
    save();
    $("palette-select").value = p.id;
    render();
  });
  $("palette-rename").addEventListener("click", () => {
    if (api.canEdit() && current()) {
      current().name = $("palette-name").value.trim().slice(0, 50);
      save();
    }
  });
  $("palette-delete").addEventListener("click", () => {
    if (api.canEdit() && current()) {
      state.palettes = state.palettes.filter((p) => p !== current());
      save();
    }
  });
  $("palette-add-color").addEventListener("click", () => {
    const p = current();
    if (
      api.canEdit() &&
      p &&
      p.colors.length < 32 &&
      !p.colors.includes(state.color)
    ) {
      p.colors.push(state.color);
      save();
    }
  });
  $("palette-remove-color").addEventListener("click", () => {
    const p = current();
    if (api.canEdit() && p) {
      p.colors = p.colors.filter((c) => c !== state.color);
      save();
    }
  });
  $("palette-star").addEventListener("click", () => {
    if (!api.canEdit()) return;
    const i = state.favoriteColors.indexOf(state.color);
    if (i >= 0) state.favoriteColors.splice(i, 1);
    else if (state.favoriteColors.length < 64)
      state.favoriteColors.push(state.color);
    else return api.toast("paletteFull");
    save();
  });
  function extract(image) {
    if (!image) return api.toast("paletteNoReference");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0, 128, 128);
    const colors = extractColors(ctx.getImageData(0, 0, 128, 128).data);
    if (!colors.length) return api.toast("paletteNoColors");
    let p = current();
    if (!p) {
      if (state.palettes.length >= 8) return api.toast("paletteFull");
      p = { id: crypto.randomUUID(), name: "", colors: [] };
      state.palettes.push(p);
    }
    const next = [...new Set([...p.colors, ...colors])];
    if (next.length > 32) return api.toast("paletteFull");
    p.colors = next;
    save();
    $("palette-select").value = p.id;
    render();
    api.toast("paletteExtracted", { n: colors.length });
  }
  $("palette-from-reference").addEventListener("click", () => {
    if (api.canEdit()) extract(api.referenceImage());
  });
  $("palette-from-image").addEventListener("click", () => {
    if (api.canEdit()) $("palette-file").click();
  });
  $("palette-file").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file || !api.canEdit()) return;
    let image;
    state.busy = true;
    try {
      if (
        file.size > 30_000_000 ||
        !["image/png", "image/jpeg", "image/webp"].includes(file.type)
      )
        throw new Error("Invalid image");
      image = await createImageBitmap(file, {
        imageOrientation: "from-image",
        resizeWidth: 128,
        resizeHeight: 128,
      });
      extract(image);
    } catch {
      api.toast("errorImage");
    } finally {
      image?.close();
      state.busy = false;
      api.updateHistoryButtons();
    }
  });
  return { open, refreshLanguage: render };
}
