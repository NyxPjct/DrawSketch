import { getWorkspace, patchWorkspace, getDocument } from "./storage.js";
import { normalizeStudy, remainingSeconds } from "./study-model.js";
export function initStudy(api) {
  const { $, state, t } = api;
  let data = normalizeStudy(),
    loading = true,
    running = false,
    remaining = 60,
    deadline = 0,
    round = 1,
    refIndex = 0,
    image = null,
    imageGeneration = 0,
    documentId = null,
    timer = null,
    saving = false,
    pending = null,
    recorded = false;
  async function persist() {
    pending = {
      ...data,
      references: [...data.references],
      sessions: [...data.sessions],
    };
    if (saving) return;
    saving = true;
    try {
      while (pending) {
        const next = pending;
        pending = null;
        try {
          await patchWorkspace("drawsketch-study-v1", { study: next });
        } catch {
          api.toast("studySaveError");
        }
      }
    } finally {
      saving = false;
    }
  }
  function render() {
    const compact = $("study-panel").classList.contains("compact");
    $("study-collapse").setAttribute("aria-expanded", String(!compact));
    $("study-collapse").setAttribute(
      "aria-label",
      t(compact ? "studyExpand" : "studyCollapse"),
    );
    $("study-collapse").title = t(compact ? "studyExpand" : "studyCollapse");
    $("study-collapse").textContent = compact ? "▾" : "▴";
    $("study-time").textContent =
      String(Math.floor(remaining / 60)).padStart(2, "0") +
      ":" +
      String(remaining % 60).padStart(2, "0");
    $("study-round").textContent = t("studyRound", {
      n: round,
      total: data.rounds,
    });
    $("study-status").textContent = t(
      remaining === 0
        ? "studyFinished"
        : running
          ? "studyRunning"
          : "studyPaused",
    );
    $("study-exercise-name").textContent = t("exercise" + data.exercise);
    $("study-exercise-hint").textContent = t(
      "exercise" + data.exercise + "Hint",
    );
    $("study-resume").disabled =
      loading || running || remaining === 0 || documentId !== state.id;
    $("study-pause").disabled = !running;
    $("study-next").disabled =
      loading || remaining !== 0 || round >= data.rounds;
    $("study-start").disabled = loading;
    $("study-reference-add").disabled = loading || data.references.length >= 12;
    $("study-reference-use").disabled = loading || data.references.length >= 12;
    $("study-reference-clear").disabled = !data.references.length || loading;
    $("study-reference-count").textContent = t("studyReferenceCount", {
      n: data.references.length,
    });
    const ctx = $("study-reference-canvas").getContext("2d"),
      c = ctx.canvas;
    ctx.clearRect(0, 0, c.width, c.height);
    $("study-reference-empty").hidden = !!image;
    if (image) {
      const s = Math.min(c.width / image.width, c.height / image.height);
      const x = (c.width - image.width * s) / 2,
        y = (c.height - image.height * s) / 2;
      ctx.drawImage(image, x, y, image.width * s, image.height * s);
      if ($("study-reference-grid").checked) {
        ctx.strokeStyle = "#ff8a24";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 1; i < 3; i++) {
          ctx.moveTo(x + (image.width * s * i) / 3, y);
          ctx.lineTo(x + (image.width * s * i) / 3, y + image.height * s);
          ctx.moveTo(x, y + (image.height * s * i) / 3);
          ctx.lineTo(x + image.width * s, y + (image.height * s * i) / 3);
        }
        ctx.stroke();
      }
    }
    $("study-reference-name").textContent =
      data.references[refIndex]?.name || "";
  }
  async function choose() {
    const generation = ++imageGeneration;
    image = null;
    render();
    const entry = data.references[refIndex];
    if (!entry) return;
    try {
      const next = new Image();
      next.src = entry.image;
      await next.decode();
      if (generation === imageGeneration) {
        image = next;
        render();
      }
    } catch {
      if (generation === imageGeneration) api.toast("referenceError");
    }
  }
  function pause(complete = true) {
    const wasRunning = running;
    if (running) remaining = remainingSeconds(deadline, performance.now());
    running = false;
    clearInterval(timer);
    if (complete && wasRunning && remaining === 0 && !recorded) {
      finish();
      return;
    }
    render();
  }
  function finish() {
    if (recorded) return;
    recorded = true;
    pause(false);
    remaining = 0;
    const c = document.createElement("canvas");
    c.width = 240;
    c.height = Math.max(1, Math.round((240 * state.height) / state.width));
    if (c.height > 240) {
      c.width = Math.max(1, Math.round((240 * state.width) / state.height));
      c.height = 240;
    }
    c.getContext("2d").drawImage($("drawing-canvas"), 0, 0, c.width, c.height);
    data.sessions.push({
      id: crypto.randomUUID(),
      documentId,
      exercise: data.exercise,
      duration: data.duration,
      finishedAt: Date.now(),
      thumbnail: c.toDataURL("image/jpeg", 0.7),
    });
    data.sessions = data.sessions.slice(-100);
    persist();
    history();
    render();
    api.toast("studyComplete");
  }
  function resume() {
    if (
      !api.canEdit() ||
      !remaining ||
      loading ||
      documentId !== state.id ||
      running
    )
      return;
    api.setPractice(data.exercise);
    running = true;
    deadline = performance.now() + remaining * 1000;
    timer = setInterval(() => {
      if (!running) return;
      remaining = remainingSeconds(deadline, performance.now());
      if (!remaining) finish();
      else render();
    }, 250);
    render();
  }
  function history() {
    $("study-history").replaceChildren();
    for (const session of [...data.sessions].reverse()) {
      const button = document.createElement("button");
      button.className = "study-history-entry";
      const img = document.createElement("img");
      img.src = session.thumbnail;
      img.alt = "";
      img.loading = "lazy";
      const label = document.createElement("span");
      label.textContent =
        t("exercise" + session.exercise) +
        " · " +
        session.duration +
        " s · " +
        new Date(session.finishedAt).toLocaleString(api.getLanguage());
      button.append(img, label);
      button.addEventListener("click", async () => {
        pause();
        try {
          const record = await getDocument(session.documentId);
          if (!record) return api.toast("studyDocumentMissing");
          await api.openRecord(record);
          $("study-dialog").close();
        } catch {
          api.toast("errorProject");
        }
      });
      $("study-history").append(button);
    }
    $("study-history-empty").hidden = !!data.sessions.length;
  }
  function open() {
    pause();
    $("study-exercise").value = data.exercise;
    $("study-duration").value = data.duration;
    $("study-rounds").value = data.rounds;
    history();
    render();
    $("study-dialog").showModal();
  }
  $("study-start").addEventListener("click", () => {
    if (loading || !api.canEdit()) return;
    pause();
    data = normalizeStudy({
      ...data,
      exercise: $("study-exercise").value,
      duration: Number($("study-duration").value),
      rounds: Number($("study-rounds").value),
    });
    remaining = data.duration;
    round = 1;
    refIndex = 0;
    documentId = state.id;
    recorded = false;
    $("study-panel").classList.toggle(
      "compact",
      matchMedia("(max-width: 599px)").matches,
    );
    api.setPractice(data.exercise);
    choose();
    persist();
    $("study-dialog").close();
    $("study-panel").hidden = false;
    resume();
  });
  $("study-pause").addEventListener("click", pause);
  $("study-resume").addEventListener("click", resume);
  $("study-next").addEventListener("click", () => {
    if (remaining || round >= data.rounds || !api.canEdit()) return;
    round++;
    remaining = data.duration;
    recorded = false;
    documentId = state.id;
    refIndex = data.references.length
      ? (refIndex + 1) % data.references.length
      : 0;
    choose();
    resume();
  });
  $("study-collapse").addEventListener("click", () => {
    $("study-panel").classList.toggle("compact");
    render();
  });
  $("study-close").addEventListener("click", () => {
    pause();
    $("study-panel").hidden = true;
    api.setPractice(null);
  });
  $("study-manage").addEventListener("click", open);
  $("study-new-canvas").addEventListener("click", () => {
    pause();
    $("study-dialog").close();
    $("new-document").click();
  });
  $("study-reference-grid").addEventListener("change", render);
  $("study-reference-add").addEventListener("click", () =>
    $("study-files").click(),
  );
  async function addImage(source, name) {
    if (data.references.length >= 12) return;
    const c = document.createElement("canvas"),
      s = Math.min(1, 1024 / Math.max(source.width, source.height));
    c.width = Math.max(1, Math.round(source.width * s));
    c.height = Math.max(1, Math.round(source.height * s));
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(source, 0, 0, c.width, c.height);
    data.references.push({
      name: name.slice(0, 100),
      image: c.toDataURL("image/jpeg", 0.85),
    });
  }
  $("study-reference-use").addEventListener("click", async () => {
    const source = api.referenceImage();
    if (!source) return api.toast("paletteNoReference");
    await addImage(source, t("studyImportedReference"));
    persist();
    choose();
  });
  $("study-files").addEventListener("change", async (event) => {
    const files = [...event.target.files];
    event.target.value = "";
    if (loading) return;
    loading = true;
    render();
    for (const file of files.slice(0, 12 - data.references.length)) {
      let bitmap;
      try {
        if (
          file.size > 30000000 ||
          !["image/png", "image/jpeg", "image/webp"].includes(file.type)
        )
          throw Error("Invalid image");
        bitmap = await createImageBitmap(file, {
          imageOrientation: "from-image",
        });
        await addImage(bitmap, file.name);
      } catch {
        api.toast("referenceError");
      } finally {
        bitmap?.close();
      }
    }
    loading = false;
    persist();
    choose();
    render();
  });
  $("study-reference-clear").addEventListener("click", () => {
    if (loading) return;
    data.references = [];
    refIndex = 0;
    persist();
    choose();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
  });
  getWorkspace("drawsketch-study-v1")
    .then((value) => {
      data = normalizeStudy(value.study);
      remaining = data.duration;
      loading = false;
      choose();
      history();
      render();
    })
    .catch(() => {
      loading = false;
      api.toast("studySaveError");
      render();
    });
  return {
    open,
    documentChanged: () => {
      if (documentId && documentId !== state.id) {
        pause(false);
        api.setPractice(null);
      }
    },
    refreshLanguage: () => {
      history();
      render();
    },
  };
}
