import { fillPixels } from "./fill.js";
self.onmessage = ({ data }) => {
  try {
    const pixels = new Uint8ClampedArray(data.buffer);
    const changed = fillPixels(
      pixels,
      data.width,
      data.height,
      data.start,
      data.config,
    );
    self.postMessage({ id: data.id, changed, buffer: pixels.buffer }, [
      pixels.buffer,
    ]);
  } catch (error) {
    self.postMessage({ id: data.id, error: String(error.message) });
  }
};
