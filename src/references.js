import { getWorkspace, patchWorkspace } from "./storage.js";

export function initReferences(api) {
  const { $, t, state } = api;
  const view = $("reference-canvas"),
    ctx = view.getContext("2d", { willReadFrequently: true });
  let id = null,
    entries = [],
    image = null,
    zoom = 1,
    angle = 0,
    pan = { x: 0, y: 0 },
    drag = null,
    picking = false,
    loading = false,
    imageGeneration = 0;
  const selected = () =>
    entries.find((item) => item.id === $("reference-select").value);
  function fit() {
    zoom = 1;
    angle = 0;
    pan = { x: 0, y: 0 };
    render();
  }
  function scale() {
    return image
      ? Math.min(
          (view.width - 24) / image.width,
          (view.height - 24) / image.height,
        ) * zoom
      : 1;
  }
  function render() {
    ctx.clearRect(0, 0, view.width, view.height);
    if (image) {
      ctx.save();
      ctx.translate(view.width / 2 + pan.x, view.height / 2 + pan.y);
      ctx.rotate((angle * Math.PI) / 180);
      ctx.scale(scale(), scale());
      ctx.drawImage(image, -image.width / 2, -image.height / 2);
      ctx.restore();
    }
    $("reference-empty").hidden = !!image;
    $("reference-hint").hidden = !!image;
    for (const control of [
      "reference-zoom",
      "reference-rotate",
      "reference-fit",
      "reference-pick",
      "reference-remove",
    ])
      $(control).disabled = !image || loading;
    $("reference-add").disabled = loading || entries.length >= 4;
    $("reference-select").disabled = !entries.length || loading;
    $("reference-zoom").value = Math.round(zoom * 100);
    $("reference-zoom-value").textContent = `${Math.round(zoom * 100)}%`;
    $("reference-rotate").value = angle;
    $("reference-rotate-value").textContent = `${angle}°`;
    $("reference-pick").setAttribute("aria-pressed", String(picking));
    view.style.cursor = picking ? "crosshair" : "grab";
  }
  async function choose() {
    const generation = ++imageGeneration,
      entry = selected();
    image = null;
    fit();
    if (!entry) return;
    try {
      const bitmap = new Image();
      bitmap.src = entry.image;
      await bitmap.decode();
      if (generation !== imageGeneration) return;
      image = bitmap;
      fit();
    } catch {
      if (generation === imageGeneration) api.toast("referenceError");
    }
  }
  function list() {
    const current = $("reference-select").value;
    $("reference-select").replaceChildren();
    for (const entry of entries) {
      const option = document.createElement("option");
      option.value = entry.id;
      option.textContent = entry.name;
      $("reference-select").append(option);
    }
    if (entries.some((item) => item.id === current))
      $("reference-select").value = current;
  }
  async function load(nextId) {
    if (id === nextId) return;
    id = nextId;
    entries = [];
    image = null;
    imageGeneration++;
    loading = true;
    list();
    render();
    try {
      const record = await getWorkspace(nextId);
      if (id !== nextId) return;
      entries = record.references || [];
    } catch {
      if (id === nextId) api.toast("referenceError");
    }
    if (id === nextId) {
      loading = false;
      list();
      await choose();
      render();
    }
  }
  function setOpen(open) {
    $("reference-panel").hidden = !open;
    $("references-open").setAttribute("aria-expanded", String(open));
    if (open) $("reference-close").focus();
    else $("references-open").focus();
  }
  $("references-open").addEventListener("click", () =>
    setOpen($("reference-panel").hidden),
  );
  $("reference-close").addEventListener("click", () => setOpen(false));
  $("reference-select").addEventListener("change", choose);
  $("reference-add").addEventListener("click", () =>
    $("reference-file").click(),
  );
  $("reference-file").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file || loading || entries.length >= 4) return;
    const target = id;
    loading = true;
    render();
    let bitmap;
    try {
      if (
        file.size > 30_000_000 ||
        !["image/png", "image/jpeg", "image/webp"].includes(file.type)
      )
        throw new Error("Invalid image");
      bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      if (id !== target) return;
      const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const output = document.createElement("canvas");
      output.width = Math.max(1, Math.round(bitmap.width * ratio));
      output.height = Math.max(1, Math.round(bitmap.height * ratio));
      output
        .getContext("2d")
        .drawImage(bitmap, 0, 0, output.width, output.height);
      const entry = {
        id: crypto.randomUUID(),
        name: file.name.slice(0, 80),
        image: output.toDataURL("image/png"),
      };
      const next = [...entries, entry];
      if (
        next.reduce((sum, item) => sum + item.image.length * 2, 0) > 32_000_000
      ) {
        api.toast("referenceFull");
        return;
      }
      await patchWorkspace(target, { references: next });
      if (id !== target) return;
      entries = next;
      list();
      $("reference-select").value = entry.id;
      await choose();
      api.toast("referenceAdded");
    } catch {
      api.toast("referenceError");
    } finally {
      bitmap?.close();
      if (id === target) {
        loading = false;
        render();
      }
    }
  });
  $("reference-remove").addEventListener("click", async () => {
    if (loading) return;
    const target = id,
      next = entries.filter((entry) => entry.id !== selected()?.id);
    loading = true;
    render();
    try {
      await patchWorkspace(target, { references: next });
      if (id === target) {
        entries = next;
        list();
        await choose();
      }
    } catch {
      api.toast("referenceError");
    } finally {
      if (id === target) {
        loading = false;
        render();
      }
    }
  });
  $("reference-zoom").addEventListener("input", () => {
    zoom = Number($("reference-zoom").value) / 100;
    render();
  });
  $("reference-rotate").addEventListener("input", () => {
    angle = Number($("reference-rotate").value);
    render();
  });
  $("reference-fit").addEventListener("click", fit);
  $("reference-pick").addEventListener("click", () => {
    picking = !picking;
    render();
  });
  function position(event) {
    const b = view.getBoundingClientRect();
    return {
      x: ((event.clientX - b.left) * view.width) / b.width,
      y: ((event.clientY - b.top) * view.height) / b.height,
    };
  }
  view.addEventListener("pointerdown", (event) => {
    if (!image || loading) return;
    event.preventDefault();
    const p = position(event);
    if (picking) {
      const dx = p.x - view.width / 2 - pan.x,
        dy = p.y - view.height / 2 - pan.y,
        a = (-angle * Math.PI) / 180;
      const x =
        (dx * Math.cos(a) - dy * Math.sin(a)) / scale() + image.width / 2;
      const y =
        (dx * Math.sin(a) + dy * Math.cos(a)) / scale() + image.height / 2;
      if (x >= 0 && y >= 0 && x < image.width && y < image.height) {
        const sample = document.createElement("canvas");
        sample.width = sample.height = 1;
        const sampleCtx = sample.getContext("2d");
        sampleCtx.drawImage(
          image,
          Math.floor(x),
          Math.floor(y),
          1,
          1,
          0,
          0,
          1,
          1,
        );
        const pixel = sampleCtx.getImageData(0, 0, 1, 1).data;
        if (pixel[3]) {
          api.setColor(
            "#" +
              [...pixel]
                .slice(0, 3)
                .map((v) => v.toString(16).padStart(2, "0"))
                .join(""),
          );
          api.toast("referenceColorPicked");
        }
      }
    } else {
      drag = { pointerId: event.pointerId, p, pan: { ...pan } };
      view.setPointerCapture(event.pointerId);
    }
  });
  view.addEventListener("pointermove", (event) => {
    if (drag?.pointerId === event.pointerId) {
      const p = position(event);
      pan = { x: drag.pan.x + p.x - drag.p.x, y: drag.pan.y + p.y - drag.p.y };
      render();
    }
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    view.addEventListener(type, () => {
      drag = null;
    });
  view.addEventListener("keydown", (event) => {
    const movement = {
      ArrowLeft: [-10, 0],
      ArrowRight: [10, 0],
      ArrowUp: [0, -10],
      ArrowDown: [0, 10],
    }[event.key];
    if (movement && image) {
      event.preventDefault();
      pan.x += movement[0];
      pan.y += movement[1];
      render();
    }
  });
  return { load, refreshLanguage: render, getImage: () => image };
}
