import {
  appendFrame,
  frameBytes,
  recordingProfiles,
  RECORDING_BUDGET,
} from "./recording-model.js";
import { getWorkspace, patchWorkspace } from "./storage.js";

export const MAX_FRAMES = 240;
export function recordingType() {
  if (
    typeof MediaRecorder === "undefined" ||
    !HTMLCanvasElement.prototype.captureStream
  )
    return null;
  return (
    [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/mp4",
      "video/webm",
    ].find((type) => MediaRecorder.isTypeSupported(type)) || null
  );
}
export function initTimelapse(api) {
  const { $, t } = api;
  let id = null,
    frames = [],
    status = "stopped",
    loading = false,
    exporting = false,
    generation = 0,
    previewGeneration = 0,
    interval = 1,
    edits = 0,
    compactions = 0,
    quality = "balanced",
    pending = false,
    captureTimer;
  const source = $("drawing-canvas"),
    preview = $("timelapse-preview"),
    scratch = document.createElement("canvas");
  let queue = Promise.resolve();
  const writes = new Map();
  let writing = false;
  const labels = {
    recording: "timelapseRecording",
    paused: "timelapsePaused",
    stopped: "timelapseStopped",
  };
  function render() {
    $("timelapse-storage").textContent = t("recordingStorage", {
      used: (frameBytes(frames) / 1e6).toFixed(1),
      max: RECORDING_BUDGET / 1e6,
      interval,
      edits,
    });
    $("timelapse-quality").value = quality;
    $("timelapse-quality").disabled = loading || exporting || frames.length > 0;
    $("timelapse-dialog")
      .querySelectorAll(".close-dialog")
      .forEach((button) => (button.disabled = exporting));
    $("timelapse-status").textContent = t(labels[status]);
    $("timelapse-count").textContent = t("timelapseCount", {
      n: frames.length,
      max: MAX_FRAMES,
    });
    $("timelapse-start").disabled =
      loading || exporting || status !== "stopped";
    $("timelapse-pause").disabled =
      loading || exporting || status === "stopped";
    $("timelapse-pause").textContent = t(
      status === "paused" ? "timelapseResume" : "timelapsePause",
    );
    $("timelapse-stop").disabled = loading || exporting || status === "stopped";
    $("timelapse-export").disabled =
      loading || exporting || frames.length < 2 || !recordingType();
    $("timelapse-reset").disabled = loading || exporting || !frames.length;
    $("timelapse-progress").hidden = !exporting;
    $("timelapse-unsupported").hidden = !!recordingType();
    $("timelapse-frame").max = Math.max(0, frames.length - 1);
    $("timelapse-frame").disabled = !frames.length || exporting;
    $("timelapse-open").classList.toggle(
      "is-recording",
      status === "recording",
    );
  }
  function persist() {
    writes.set(id, {
      frames: [...frames],
      status: status === "recording" ? "paused" : status,
      interval,
      edits,
      compactions,
      quality,
    });
    return drainWrites();
  }
  function drainWrites() {
    if (!writing) {
      writing = true;
      queue = (async () => {
        while (writes.size) {
          const [target, data] = writes.entries().next().value;
          writes.delete(target);
          try {
            await patchWorkspace(target, { timelapse: data });
          } catch {
            if (id === target) {
              status = "paused";
              render();
              api.toast("timelapseStorageError");
            }
          }
        }
      })().finally(() => {
        writing = false;
        if (writes.size) drainWrites();
      });
    }
    return queue;
  }
  async function showFrame() {
    const current = ++previewGeneration,
      frame = frames[Number($("timelapse-frame").value)];
    const ctx = preview.getContext("2d");
    ctx.clearRect(0, 0, preview.width, preview.height);
    if (!frame) return;
    try {
      const image = new Image();
      image.src = frame;
      await image.decode();
      if (current !== previewGeneration) return;
      const ratio = Math.min(
        preview.width / image.width,
        preview.height / image.height,
      );
      ctx.drawImage(
        image,
        (preview.width - image.width * ratio) / 2,
        (preview.height - image.height * ratio) / 2,
        image.width * ratio,
        image.height * ratio,
      );
    } catch {
      api.toast("timelapseError");
    }
  }
  function capture(force = false) {
    if (loading || status !== "recording" || !id) return;
    if (!force) edits++;
    pending = true;
    clearTimeout(captureTimer);
    if (!force && edits % interval !== 0) {
      captureTimer = setTimeout(() => capture(true), 700);
      return;
    }
    const profile = recordingProfiles[quality];
    const ratio = Math.min(
      1,
      profile.side / Math.max(source.width, source.height),
    );
    scratch.width = Math.max(1, Math.round(source.width * ratio));
    scratch.height = Math.max(1, Math.round(source.height * ratio));
    const ctx = scratch.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, scratch.width, scratch.height);
    ctx.drawImage(source, 0, 0, scratch.width, scratch.height);
    const frame = scratch.toDataURL("image/jpeg", profile.quality);
    const result = appendFrame({ frames, interval, compactions }, frame);
    pending = false;
    if (result.full) {
      status = "paused";
      persist();
      render();
      api.toast("timelapseFull");
      return;
    }
    frames = result.frames;
    interval = result.interval;
    compactions = result.compactions;
    $("timelapse-frame").max = Math.max(0, frames.length - 1);
    $("timelapse-frame").value = frames.length - 1;
    persist();
    render();
    if ($("timelapse-dialog").open) showFrame();
  }
  function flush() {
    clearTimeout(captureTimer);
    if (pending) capture(true);
  }
  async function load(next) {
    if (id === next) return;
    flush();
    id = next;
    const current = ++generation;
    frames = [];
    interval = 1;
    edits = 0;
    compactions = 0;
    quality = "balanced";
    pending = false;
    status = "stopped";
    loading = true;
    render();
    try {
      const record = await getWorkspace(next);
      if (current !== generation) return;
      frames = record.timelapse?.frames || [];
      interval = Math.max(
        1,
        Math.min(2 ** 30, Math.floor(record.timelapse?.interval || 1)),
      );
      edits = Math.max(0, Math.floor(record.timelapse?.edits || 0));
      compactions = Math.max(0, Math.floor(record.timelapse?.compactions || 0));
      quality = Object.hasOwn(
        recordingProfiles,
        record.timelapse?.quality || "",
      )
        ? record.timelapse.quality
        : "balanced";
      status = record.timelapse?.status === "paused" ? "paused" : "stopped";
    } catch {
      if (current === generation) api.toast("timelapseStorageError");
    }
    if (current === generation) {
      loading = false;
      $("timelapse-frame").value = Math.max(0, frames.length - 1);
      render();
      showFrame();
    }
  }
  $("timelapse-open").addEventListener("click", () => {
    if (api.canEdit()) {
      flush();
      render();
      showFrame();
      $("timelapse-dialog").showModal();
    }
  });
  $("timelapse-start").addEventListener("click", () => {
    if (!loading) {
      status = "recording";
      capture(true);
    }
  });
  $("timelapse-pause").addEventListener("click", () => {
    flush();
    status = status === "paused" ? "recording" : "paused";
    if (status === "recording") capture(true);
    else {
      persist();
      render();
    }
  });
  $("timelapse-stop").addEventListener("click", () => {
    flush();
    status = "stopped";
    persist();
    render();
  });
  $("timelapse-reset").addEventListener("click", () => {
    if (!$("timelapse-confirm-reset").checked)
      return api.toast("timelapseConfirm");
    frames = [];
    interval = 1;
    edits = 0;
    compactions = 0;
    quality = "balanced";
    pending = false;
    status = "stopped";
    $("timelapse-confirm-reset").checked = false;
    persist();
    render();
    showFrame();
  });
  $("timelapse-frame").addEventListener("input", showFrame);
  $("timelapse-export").addEventListener("click", async () => {
    flush();
    const fps = Number($("timelapse-fps").value);
    const mimeType = recordingType();
    if (!mimeType || frames.length < 2 || exporting) return;
    exporting = true;
    render();
    const snapshot = [...frames],
      output = document.createElement("canvas"),
      chunks = [];
    let stream, recorder;
    try {
      const first = new Image();
      first.src = snapshot[0];
      await first.decode();
      output.width = first.width;
      output.height = first.height;
      const ctx = output.getContext("2d");
      stream = output.captureStream(0);
      const track = stream.getVideoTracks()[0];
      // requestFrame avoids recording duplicate frames while an image decodes.
      const manual = typeof track.requestFrame === "function";
      if (!manual) {
        stream.getTracks().forEach((t) => t.stop());
        stream = output.captureStream(fps);
      }
      recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 3_000_000,
      });
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      const completed = new Promise((resolve, reject) => {
        recorder.onstop = resolve;
        recorder.onerror = () => reject(new Error("Recording failed"));
      });
      // Register rejection handling immediately, even while frames are being encoded.
      completed.catch(() => {});
      recorder.start();
      $("timelapse-progress").max = snapshot.length;
      for (let i = 0; i < snapshot.length; i++) {
        if (recorder.state !== "recording") throw new Error("Recorder stopped");
        const image = new Image();
        image.src = snapshot[i];
        await image.decode();
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, output.width, output.height);
        ctx.drawImage(image, 0, 0, output.width, output.height);
        if (manual) track.requestFrame();
        $("timelapse-progress").value = i + 1;
        await new Promise((resolve) => setTimeout(resolve, 1000 / fps));
      }
      recorder.stop();
      await completed;
      const blob = new Blob(chunks, { type: mimeType.split(";")[0] });
      if (!blob.size) throw new Error("Empty recording");
      api.download(blob, mimeType.startsWith("video/mp4") ? "mp4" : "webm");
      api.toast("timelapseExported");
    } catch {
      api.toast("timelapseError");
    } finally {
      if (recorder?.state === "recording") recorder.stop();
      stream?.getTracks().forEach((t) => t.stop());
      exporting = false;
      render();
    }
  });
  $("timelapse-quality").addEventListener("change", () => {
    if (
      !frames.length &&
      Object.hasOwn(recordingProfiles, $("timelapse-quality").value)
    ) {
      quality = $("timelapse-quality").value;
      persist();
      render();
    }
  });
  $("timelapse-dialog").addEventListener("cancel", (event) => {
    if (exporting) event.preventDefault();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) flush();
  });
  window.addEventListener("pagehide", flush);
  return { load, capture, flush, refreshLanguage: render };
}
