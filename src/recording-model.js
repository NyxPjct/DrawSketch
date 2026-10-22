export const FRAME_LIMIT = 240,
  RECORDING_BUDGET = 32_000_000;
export const recordingProfiles = {
  compact: { side: 512, quality: 0.65 },
  balanced: { side: 768, quality: 0.8 },
  high: { side: 1024, quality: 0.9 },
};
export const frameBytes = (frames) =>
  frames.reduce((n, f) => n + f.length * 2, 0);
export function appendFrame(
  journal,
  frame,
  limit = FRAME_LIMIT,
  budget = RECORDING_BUDGET,
) {
  if (journal.frames.at(-1) === frame) return { ...journal, changed: false };
  let frames = [...journal.frames, frame],
    interval = journal.interval,
    compactions = journal.compactions;
  while (frames.length > limit || frameBytes(frames) > budget) {
    if (frames.length <= 2) return { ...journal, changed: false, full: true };
    frames = [
      frames[0],
      ...frames.slice(1, -1).filter((_, i) => i % 2 === 1),
      frames.at(-1),
    ];
    interval = Math.min(2 ** 30, Math.max(1, interval) * 2);
    compactions++;
  }
  return { ...journal, frames, interval, compactions, changed: true };
}
