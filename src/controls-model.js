export const defaultShortcuts = {
  select: "m",
  lasso: "q",
  move: "v",
  brush: "b",
  eraser: "e",
  fill: "g",
  eyedropper: "i",
  line: "l",
  rectangle: "r",
  ellipse: "o",
  hand: "h",
  fit: "f",
  smaller: "[",
  larger: "]",
};
export const quickActions = [
  "navigator",
  "palettes",
  "adjustments",
  "timelapse",
  "references",
  "undo",
  "redo",
  "fit",
  "focus",
  "brush",
  "performance",
];
export const defaultQuickActions = ["navigator", "palettes", "adjustments", ""];
export function validShortcuts(value) {
  return (
    value &&
    typeof value === "object" &&
    Object.keys(defaultShortcuts).every(
      (k) => typeof value[k] === "string" && /^[a-z\[\]]?$/.test(value[k]),
    ) &&
    new Set(Object.values(value).filter(Boolean)).size ===
      Object.values(value).filter(Boolean).length &&
    Object.keys(value).every((k) => Object.hasOwn(defaultShortcuts, k))
  );
}
export function normalizeControls(value = {}) {
  return {
    handedness: value.handedness === "left" ? "left" : "right",
    shortcuts: validShortcuts(value.shortcuts)
      ? { ...value.shortcuts }
      : { ...defaultShortcuts },
    quickActions:
      Array.isArray(value.quickActions) &&
      value.quickActions.length === 4 &&
      value.quickActions.every((v) => v === "" || quickActions.includes(v))
        ? [...value.quickActions]
        : [...defaultQuickActions],
  };
}
