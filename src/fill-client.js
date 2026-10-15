let worker;
let nextId = 0;
const pending = new Map();
export function runFill(image, start, config) {
  worker ||= new Worker(new URL("./fill-worker.js", import.meta.url), {
    type: "module",
  });
  worker.onmessage = ({ data }) => {
    const task = pending.get(data.id);
    if (!task) return;
    clearTimeout(task.timeout);
    pending.delete(data.id);
    if (data.error) task.reject(new Error(data.error));
    else task.resolve(data);
  };
  worker.onerror = (event) => {
    for (const task of pending.values()) {
      clearTimeout(task.timeout);
      task.reject(new Error(event.message));
    }
    pending.clear();
    worker.terminate();
    worker = null;
  };
  return new Promise((resolve, reject) => {
    const id = ++nextId,
      timeout = setTimeout(() => {
        pending.delete(id);
        worker?.terminate();
        worker = null;
        reject(new Error("Fill operation timed out"));
      }, 30_000);
    pending.set(id, { resolve, reject, timeout });
    worker.postMessage(
      {
        id,
        width: image.width,
        height: image.height,
        start,
        config,
        buffer: image.data.buffer,
      },
      [image.data.buffer],
    );
  });
}
