import {
  listDocuments,
  importDocuments,
  updateOrganization,
} from "./storage.js";

export function initLibrary(api) {
  const { $, t } = api;
  let folders = [],
    generation = 0;
  try {
    const stored = JSON.parse(
      localStorage.getItem("drawsketch.folders.v1") || "[]",
    );
    if (Array.isArray(stored))
      folders = stored
        .filter((v) => typeof v === "string" && v.length <= 50)
        .slice(0, 100);
  } catch {}
  function options(select, selected, filter = false) {
    select.replaceChildren();
    for (const [value, text] of [
      ...(filter ? [["*", t("allFolders")]] : []),
      ["", t("unfiled")],
      ...folders.map((name) => [name, name]),
    ]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      select.append(option);
    }
    select.value = selected;
  }
  async function render() {
    const current = ++generation;
    try {
      const records = await listDocuments();
      if (current !== generation) return;
      folders = [
        ...new Set([
          ...folders,
          ...records.map((r) => r.organization?.folder).filter(Boolean),
        ]),
      ].sort((a, b) => a.localeCompare(b));
      const folder = $("gallery-folder").value;
      options($("gallery-folder"), folder, true);
      const query = $("gallery-search")
        .value.trim()
        .toLocaleLowerCase(api.getLanguage());
      const favorites =
        $("gallery-favorites").getAttribute("aria-pressed") === "true";
      const sorted = records.filter(
        (record) =>
          (!query ||
            api
              .recordName(record)
              .toLocaleLowerCase(api.getLanguage())
              .includes(query)) &&
          (folder === "*" || (record.organization?.folder || "") === folder) &&
          (!favorites || record.organization?.favorite),
      );
      if ($("gallery-sort").value === "name")
        sorted.sort((a, b) =>
          api.recordName(a).localeCompare(api.recordName(b), api.getLanguage()),
        );
      const list = $("gallery-list");
      list.replaceChildren();
      if (!sorted.length) {
        const p = document.createElement("p");
        p.className = "gallery-empty";
        p.textContent = t("libraryNoResults");
        list.append(p);
      }
      for (const record of sorted) {
        const name = api.recordName(record),
          org = record.organization || { folder: "", favorite: false };
        const wrapper = document.createElement("article");
        wrapper.className = "gallery-entry";
        const card = document.createElement("button");
        card.className = "gallery-card";
        card.setAttribute("aria-label", t("openDrawing", { name }));
        const image = new Image();
        image.src = record.thumbnail;
        image.alt = "";
        const title = document.createElement("strong");
        title.textContent = name;
        const date = document.createElement("small");
        date.textContent = t("gallerySaved", {
          date: new Intl.DateTimeFormat(api.getLanguage(), {
            dateStyle: "medium",
          }).format(record.updatedAt),
        });
        card.append(image, title, date);
        card.addEventListener("click", () => api.openRecord(record));
        const actions = document.createElement("div");
        actions.className = "gallery-entry-actions";
        const favorite = document.createElement("button");
        favorite.textContent = org.favorite ? "★" : "☆";
        favorite.setAttribute("aria-label", t("favoriteDrawing", { name }));
        favorite.setAttribute("aria-pressed", String(org.favorite));
        favorite.addEventListener("click", async () => {
          try {
            await updateOrganization(record.id, {
              favorite: !org.favorite,
            });
            await render();
          } catch {
            api.toast("errorGallery");
          }
        });
        const duplicate = document.createElement("button");
        duplicate.textContent = t("duplicateDrawing");
        duplicate.addEventListener("click", async () => {
          if (!api.canEdit()) return;
          duplicate.disabled = true;
          try {
            const id = crypto.randomUUID(),
              title = t("copyTitle", { name }).slice(0, 80);
            await importDocuments([
              {
                ...record,
                id,
                title,
                updatedAt: Date.now(),
                data: { ...record.data, id, title, titleKey: "" },
              },
            ]);
            await render();
            api.toast("drawingDuplicated");
          } catch {
            duplicate.disabled = false;
            api.toast("errorGallery");
          }
        });
        const select = document.createElement("select");
        options(select, org.folder);
        select.setAttribute("aria-label", t("drawingFolder", { name }));
        select.addEventListener("change", async () => {
          try {
            await updateOrganization(record.id, {
              folder: select.value,
            });
            await render();
          } catch {
            api.toast("errorGallery");
          }
        });
        actions.append(favorite, duplicate, select);
        wrapper.append(card, actions);
        list.append(wrapper);
      }
    } catch {
      api.toast("errorGallery");
    }
  }
  $("gallery-search").addEventListener("input", render);
  for (const id of ["gallery-folder", "gallery-sort"])
    $(id).addEventListener("change", render);
  $("gallery-favorites").addEventListener("click", () => {
    $("gallery-favorites").setAttribute(
      "aria-pressed",
      String($("gallery-favorites").getAttribute("aria-pressed") !== "true"),
    );
    render();
  });
  $("create-folder").addEventListener("click", () => {
    const name = $("new-folder-name").value.trim().slice(0, 50);
    if (!name || name === "*" || folders.length >= 100)
      return api.toast("folderInvalid");
    const next = [...new Set([...folders, name])];
    try {
      localStorage.setItem("drawsketch.folders.v1", JSON.stringify(next));
      folders = next;
      $("new-folder-name").value = "";
      render();
      api.toast("folderCreated");
    } catch {
      api.toast("errorSave");
    }
  });
  return { render };
}
