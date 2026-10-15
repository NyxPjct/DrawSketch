// Entries share immutable PNG strings for unchanged canvases. Budget counts each unique image once.
export function trimHistory(entries, budget = 96_000_000, maximum = 80) {
  const references = new Map();
  let bytes = 0;
  const images = (entry) =>
    entry.layers.flatMap((layer) => [layer.image, layer.mask].filter(Boolean));
  for (const entry of entries)
    for (const image of images(entry)) {
      if (!references.has(image)) bytes += image.length * 2;
      references.set(image, (references.get(image) || 0) + 1);
    }
  while (entries.length > 1 && (entries.length > maximum || bytes > budget)) {
    for (const image of images(entries.shift())) {
      const count = references.get(image) - 1;
      if (count) references.set(image, count);
      else {
        references.delete(image);
        bytes -= image.length * 2;
      }
    }
  }
  return bytes;
}
