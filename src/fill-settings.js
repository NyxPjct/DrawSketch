export function initFillSettings(api) {
  const { $, settings } = api;
  function sync() {
    $("fill-reference").value = settings.fill.reference;
    for (const key of ["gap", "expand"]) {
      $("fill-" + key).value = settings.fill[key];
      $("fill-" + key + "-value").textContent = settings.fill[key] + " px";
    }
  }
  for (const id of ["fill-reference", "fill-gap", "fill-expand"])
    $(id).addEventListener("input", () => {
      settings.fill = {
        reference: $("fill-reference").value,
        gap: Number($("fill-gap").value),
        expand: Number($("fill-expand").value),
      };
      api.persistSettings();
      sync();
    });
  sync();
  return {
    open: () => {
      sync();
      $("fill-dialog").showModal();
    },
    refreshLanguage: sync,
  };
}
