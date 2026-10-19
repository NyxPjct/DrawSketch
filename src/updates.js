export function initUpdates(api) {
  const { $, t } = api,
    desktop = window.drawsketchDesktop;
  let status = { state: "unavailable", version: __APP_VERSION__ };
  const states = {
    unavailable: "updatesUnavailable",
    idle: "updatesIdle",
    checking: "updatesChecking",
    available: "updatesAvailable",
    current: "updatesCurrent",
    downloading: "updatesDownloading",
    downloaded: "updatesDownloaded",
    error: "updatesError",
  };
  function render() {
    $("updates-status").textContent = t(
      states[status.state] || "updatesError",
      {
        version: status.version || __APP_VERSION__,
        percent: Math.round(status.percent || 0),
      },
    );
    $("updates-check").disabled = ![
      "idle",
      "current",
      "available",
      "error",
    ].includes(status.state);
    $("updates-download").disabled = status.state !== "available";
    $("updates-install").disabled = status.state !== "downloaded";
    $("updates-auto").disabled = status.state === "unavailable";
    $("updates-auto").checked = !!status.automatic;
  }
  async function invoke(action, value) {
    try {
      status = await desktop.updates(action, value);
      render();
    } catch {
      status = { ...status, state: "error" };
      render();
    }
  }
  $("updates-open").addEventListener("click", async () => {
    $("settings-dialog").close();
    $("updates-dialog").showModal();
    render();
    if (desktop?.updates) await invoke("status");
  });
  $("updates-check").addEventListener("click", () => invoke("check"));
  $("updates-download").addEventListener("click", () => invoke("download"));
  $("updates-install").addEventListener("click", async () => {
    if (api.canEdit() && (await api.saveLocal())) await invoke("install");
    else api.toast("updatesSaveFailed");
  });
  $("updates-auto").addEventListener("change", () =>
    invoke("automatic", $("updates-auto").checked),
  );
  let timer;
  $("updates-dialog").addEventListener("close", () => clearInterval(timer));
  $("updates-dialog").addEventListener("beforetoggle", (event) => {
    clearInterval(timer);
    if (event.newState === "open" && desktop?.updates)
      timer = setInterval(() => invoke("status"), 1000);
  });
  render();
  return { refreshLanguage: render };
}
