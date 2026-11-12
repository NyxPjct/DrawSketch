import { fillPixels } from "./fill.js";
import { professionalFill } from "./fill-pro.js";
self.onmessage = ({ data }) => {
  try {
    const pixels = new Uint8ClampedArray(data.buffer);
    const changed =
      data.reference || data.config.gap || data.config.expand
        ? professionalFill(
            pixels,
            data.reference
              ? new Uint8ClampedArray(data.reference)
              : pixels.slice(),
            data.width,
            data.height,
            data.start,
            data.config,
          )
        : fillPixels(pixels, data.width, data.height, data.start, data.config);
    self.postMessage({ id: data.id, changed, buffer: pixels.buffer }, [
      pixels.buffer,
    ]);
  } catch (error) {
    self.postMessage({ id: data.id, error: String(error.message) });
  }
};
