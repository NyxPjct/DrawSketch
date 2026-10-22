import {
  defaultShortcuts,
  defaultQuickActions,
  quickActions,
  validShortcuts,
} from "./controls-model.js";
const labelKeys = {
  fit: "fitCanvas",
  smaller: "brushSmaller",
  larger: "brushLarger",
  navigator: "navigator",
  palettes: "projectPalettes",
  adjustments: "layerAdjustments",
  timelapse: "timelapse",
  references: "references",
  undo: "undoTip",
  redo: "redoTip",
  focus: "focus",
  brush: "brush",
  performance: "performance",
};
const icons = {
  navigator: "grid",
  palettes: "color",
  adjustments: "sun",
  timelapse: "clock",
  references: "image",
  undo: "undo",
  redo: "redo",
  fit: "expand",
  focus: "expand",
  brush: "brush",
  performance: "spark",
};
export function initComfort(api) {
  const { $, settings, t } = api;
  const label = (action) => t(labelKeys[action] || action);
  function hints() {
    document
      .querySelectorAll("#help-dialog kbd:not([data-i18n])")
      .forEach((kbd) => {
        const action =
          kbd.parentElement.querySelector("[data-i18n]")?.dataset.i18n;
        if (Object.hasOwn(defaultShortcuts, action || ""))
          kbd.textContent = settings.shortcuts[action]?.toUpperCase() || "—";
      });
    document
      .querySelectorAll("[data-tool][data-i18n-title]")
      .forEach((button) => {
        const key = settings.shortcuts[button.dataset.tool];
        const text = t(button.dataset.i18nTitle).replace(
          /\s*\([A-Z\[\]]\)$/i,
          key ? ` (${key.toUpperCase()})` : "",
        );
        button.title = text;
        if (button.dataset.i18nAriaLabel)
          button.setAttribute("aria-label", t(button.dataset.i18nAriaLabel));
      });
  }
  function renderBar() {
    $("quick-actions").replaceChildren();
    for (const action of settings.quickActions.filter(Boolean)) {
      const b = document.createElement("button");
      b.className = "icon-button";
      b.dataset.quickAction = action;
      b.title = label(action);
      b.setAttribute("aria-label", label(action));
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"),
        use = document.createElementNS("http://www.w3.org/2000/svg", "use");
      use.setAttribute("href", `#i-${icons[action]}`);
      svg.setAttribute("aria-hidden", "true");
      svg.append(use);
      b.append(svg);
      b.addEventListener("click", () => api.performAction(action));
      $("quick-actions").append(b);
    }
    $("quick-actions").hidden = !settings.quickActions.some(Boolean);
    hints();
    sync();
  }
  function sync() {
    for (const action of ["undo", "redo"])
      document
        .querySelectorAll(`[data-quick-action=${action}]`)
        .forEach((button) => (button.disabled = $(action).disabled));
  }
  function persist() {
    api.persistSettings();
    apply();
  }
  function apply() {
    document.body.dataset.handedness = settings.handedness;
    $("handedness").value = settings.handedness;
    renderBar();
  }
  function render() {
    $("shortcut-list").replaceChildren();
    for (const action of Object.keys(defaultShortcuts)) {
      const row = document.createElement("label");
      row.className = "shortcut-row";
      const text = document.createElement("span");
      text.textContent = label(action);
      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = 1;
      input.value = settings.shortcuts[action];
      input.dataset.shortcut = action;
      input.setAttribute("aria-label", label(action));
      input.autocomplete = "off";
      input.spellcheck = false;
      input.addEventListener("change", () => {
        const next = {
          ...settings.shortcuts,
          [action]: input.value.toLowerCase().trim(),
        };
        if (!validShortcuts(next)) {
          input.value = settings.shortcuts[action];
          return api.toast("shortcutConflict");
        }
        settings.shortcuts = next;
        persist();
      });
      row.append(text, input);
      $("shortcut-list").append(row);
    }
    $("quick-action-settings").replaceChildren();
    settings.quickActions.forEach((action, i) => {
      const row = document.createElement("label");
      row.className = "form-label";
      const text = document.createElement("span");
      text.textContent = t("quickSlot", { n: i + 1 });
      const select = document.createElement("select");
      select.dataset.quickSlot = i;
      for (const value of ["", ...quickActions]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value ? label(value) : t("quickNone");
        select.append(option);
      }
      select.value = action;
      select.addEventListener("change", () => {
        settings.quickActions[i] = select.value;
        persist();
      });
      row.append(text, select);
      $("quick-action-settings").append(row);
    });
    apply();
  }
  function open() {
    render();
    $("comfort-dialog").showModal();
  }
  $("workspace-open").addEventListener("click", () => {
    $("settings-dialog").close();
    open();
  });
  $("handedness").addEventListener("change", () => {
    settings.handedness = $("handedness").value;
    persist();
    api.fitCanvas();
  });
  $("controls-reset").addEventListener("click", () => {
    settings.shortcuts = { ...defaultShortcuts };
    settings.quickActions = [...defaultQuickActions];
    settings.handedness = "right";
    persist();
    render();
    api.fitCanvas();
  });
  for (const action of ["navigator", "palettes", "adjustments", "performance"])
    $("workspace-" + action).addEventListener("click", () => {
      $("comfort-dialog").close();
      api.performAction(action);
    });
  apply();
  return {
    refreshLanguage: () => {
      render();
    },
    open,
    sync,
  };
}
