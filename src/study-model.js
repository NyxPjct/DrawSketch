export const exerciseKeys = ["gesture", "lines", "ellipses", "values"];
export function normalizeStudy(data = {}) {
  if (!data || typeof data !== "object") data = {};
  return {
    exercise: exerciseKeys.includes(data.exercise) ? data.exercise : "gesture",
    duration: Number.isFinite(data.duration)
      ? Math.max(10, Math.min(3600, Math.round(data.duration)))
      : 60,
    rounds: Number.isFinite(data.rounds)
      ? Math.max(1, Math.min(20, Math.round(data.rounds)))
      : 5,
    references: Array.isArray(data.references)
      ? data.references
          .filter(
            (r) =>
              typeof r.name === "string" &&
              r.name.length <= 100 &&
              typeof r.image === "string" &&
              /^data:image\/(jpeg|png|webp);base64,/.test(r.image) &&
              r.image.length < 2000000,
          )
          .slice(0, 12)
      : [],
    sessions: Array.isArray(data.sessions)
      ? data.sessions
          .filter(
            (s) =>
              typeof s.id === "string" &&
              typeof s.documentId === "string" &&
              exerciseKeys.includes(s.exercise) &&
              Number.isFinite(s.duration) &&
              s.duration >= 10 &&
              s.duration <= 3600 &&
              Number.isFinite(s.finishedAt) &&
              typeof s.thumbnail === "string" &&
              /^data:image\/(jpeg|png|webp);base64,/.test(s.thumbnail) &&
              s.thumbnail.length < 200000,
          )
          .slice(-100)
      : [],
  };
}
export function remainingSeconds(deadline, now) {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
