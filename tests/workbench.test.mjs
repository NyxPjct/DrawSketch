import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { launchBrowser, serve } from "../scripts/browser.mjs";
import {
  defaultCurve,
  validCurve,
  pressureResponse,
  parseBrushLibrary,
} from "../src/brush-model.js";
import { brushPresets } from "../src/engine.js";

test("Pressure curves preserve endpoints and monotonic response; brush imports validate the whole library", () => {
  assert.equal(pressureResponse(0), 0);
  assert.equal(pressureResponse(1), 1);
  assert.equal(pressureResponse(0.375), 0.375);
  assert.equal(validCurve([0, 0.6, 0.5, 0.8, 1]), false);
  assert.equal(validCurve([0, 0.2, NaN, 0.7, 1]), false);
  const soft = [0, 0.5, Math.SQRT1_2, Math.sqrt(0.75), 1];
  assert.ok(
    pressureResponse(0.25, soft) > pressureResponse(0.25, defaultCurve),
  );
  const item = {
    name: "My pencil",
    brush: "pencil",
    size: 15,
    opacity: 80,
    pressureCurve: soft,
    category: "sketch",
  };
  const library = { format: "drawsketch-brushes", version: 1, brushes: [item] };
  assert.deepEqual(
    parseBrushLibrary(library, brushPresets)[0].pressureCurve,
    soft,
  );
  assert.throws(() =>
    parseBrushLibrary(
      { ...library, brushes: [item, { ...item, size: -1 }] },
      brushPresets,
    ),
  );
});

test(
  "v0.4 workbench preserves drawings, input preferences, references, videos, and organization",
  { timeout: 180_000 },
  async (t) => {
    const server = await serve({ port: 5183 }),
      browser = await launchBrowser(),
      errors = [];
    async function open(options = {}) {
      const p = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
        ...options,
      });
      p.on("pageerror", (e) => errors.push(e.message));
      await p.goto(server.url);
      await p.waitForSelector('html[data-ready="true"]');
      return p;
    }
    async function blank(p, name = "Workbench canvas") {
      await p.locator("#new-document").click();
      await p.locator("#new-name").fill(name);
      await p.locator("#new-width").fill("600");
      await p.locator("#new-height").fill("400");
      await p.locator("#new-form button[type=submit]").click();
      await p.locator("#new-dialog").waitFor({ state: "hidden" });
    }
    const range = (p, id, value) =>
      p.locator("#" + id).evaluate((el, value) => {
        el.value = value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }, String(value));
    async function stroke(p, y = 0.4) {
      const b = await p.locator("#drawing-canvas").boundingBox();
      await p.mouse.move(b.x + b.width * 0.2, b.y + b.height * y);
      await p.mouse.down();
      await p.mouse.move(b.x + b.width * 0.7, b.y + b.height * y, { steps: 8 });
      await p.mouse.up();
    }
    async function download(p, selector) {
      const pending = p.waitForEvent("download");
      await p.locator(selector).click();
      const result = await pending;
      return {
        filename: result.suggestedFilename(),
        bytes: await readFile(await result.path()),
      };
    }
    try {
      await t.test(
        "Pressure curves change actual brush pixels, preview immediately, and round-trip through presets",
        async () => {
          const p = await open();
          await p.locator("#choose-brush").click();
          const before = await p
            .locator("#live-brush-preview")
            .evaluate((el) => el.toDataURL());
          await p
            .locator(".pressure-studio")
            .evaluate((el) => (el.open = true));
          await p.locator("#pressure-preset").selectOption("soft");
          assert.notEqual(
            await p
              .locator("#live-brush-preview")
              .evaluate((el) => el.toDataURL()),
            before,
          );
          const counts = await p.evaluate(async () => {
            const { brushSegment } = await import("/src/engine.js");
            return [
              [0, 0.25, 0.5, 0.75, 1],
              [0, 0.5, Math.SQRT1_2, Math.sqrt(0.75), 1],
            ].map((curve) => {
              const canvas = document.createElement("canvas");
              canvas.width = 100;
              canvas.height = 60;
              const ctx = canvas.getContext("2d");
              brushSegment(
                ctx,
                { x: 20, y: 30, pressure: 0.25 },
                { x: 80, y: 30, pressure: 0.25 },
                {
                  brush: "ink",
                  size: 30,
                  opacity: 100,
                  color: "#ff0000",
                  pressure: true,
                  pressureCurve: curve,
                },
              );
              return [...ctx.getImageData(0, 0, 100, 60).data].filter(
                (v, i) => i % 4 === 3 && v > 0,
              ).length;
            });
          });
          assert.ok(counts[1] > counts[0]);
          await range(p, "pressure-point-2", 10);
          const curve = await p.evaluate(
            () =>
              JSON.parse(localStorage.getItem("drawsketch.settings.v2"))
                .pressureCurve,
          );
          assert.equal(validCurve(curve), true);
          assert.equal(curve[2], curve[1]);
          await p
            .locator(".brush-studio-extra")
            .evaluate((el) => (el.open = true));
          await p.locator("#custom-brush-name").fill("Studio soft ink");
          await p.locator("#custom-brush-category").selectOption("ink");
          await p.locator("#save-brush").click();
          const exported = await download(p, "#export-brushes"),
            data = JSON.parse(exported.bytes);
          assert.deepEqual(data.brushes[0].pressureCurve, curve);
          assert.equal(data.brushes[0].category, "ink");
          await p.locator("#brushes-file").setInputFiles({
            name: "invalid.json",
            mimeType: "application/json",
            buffer: Buffer.from(
              JSON.stringify({
                ...data,
                brushes: [data.brushes[0], { ...data.brushes[0], size: -2 }],
              }),
            ),
          });
          await p.waitForFunction(() =>
            document
              .getElementById("toast")
              .textContent.includes("No presets were changed"),
          );
          assert.equal(
            await p.locator("#custom-brush-list .custom-brush-item").count(),
            1,
          );
          await p.locator("#brushes-file").setInputFiles({
            name: "brushes.json",
            mimeType: "application/json",
            buffer: exported.bytes,
          });
          await p.waitForFunction(
            () =>
              document.querySelectorAll("#custom-brush-list .custom-brush-item")
                .length === 2,
          );
          await p.locator("#brush-category-filter").selectOption("paint");
          assert.equal(
            await p.locator("#custom-brush-list .custom-brush-item").count(),
            0,
          );
          await p.reload();
          await p.waitForSelector('html[data-ready="true"]');
          assert.deepEqual(
            await p.evaluate(
              () =>
                JSON.parse(localStorage.getItem("drawsketch.settings.v2"))
                  .pressureCurve,
            ),
            curve,
          );
          await p.close();
        },
      );
      await t.test(
        "References pan/rotate/zoom, pick source colors, persist, and never add artwork layers",
        async () => {
          const p = await open();
          await blank(p);
          const layers = await p.locator(".layer-item").count();
          await p.locator("#references-open").click();
          const image = await p.evaluate(() => {
            const c = document.createElement("canvas");
            c.width = 120;
            c.height = 80;
            const x = c.getContext("2d");
            x.fillStyle = "#e52535";
            x.fillRect(0, 0, 120, 80);
            return c.toDataURL();
          });
          await p.locator("#reference-file").setInputFiles({
            name: "reference.png",
            mimeType: "image/png",
            buffer: Buffer.from(image.split(",")[1], "base64"),
          });
          await p.waitForFunction(
            () => !document.getElementById("reference-pick").disabled,
          );
          await range(p, "reference-zoom", 160);
          await range(p, "reference-rotate", 45);
          await p.locator("#reference-pick").click();
          await p
            .locator("#reference-canvas")
            .click({ position: { x: 150, y: 90 } });
          assert.equal(
            (await p.locator("#hex-input").inputValue()).toLowerCase(),
            "#e52535",
          );
          assert.equal(await p.locator(".layer-item").count(), layers);
          await p.locator("#reference-pick").click();
          const b = await p.locator("#reference-canvas").boundingBox();
          await p.mouse.move(b.x + 100, b.y + 80);
          await p.mouse.down();
          await p.mouse.move(b.x + 130, b.y + 100);
          await p.mouse.up();
          await p.reload();
          await p.waitForSelector('html[data-ready="true"]');
          await p.locator("#references-open").click();
          await p.waitForFunction(
            () => !document.getElementById("reference-pick").disabled,
          );
          assert.equal(await p.locator("#reference-select option").count(), 1);
          assert.equal(
            await p.locator("#reference-select option").textContent(),
            "reference.png",
          );
          await p.locator("#reference-close").click();
          await blank(p, "Second drawing");
          await p.locator("#references-open").click();
          assert.equal(await p.locator("#reference-select option").count(), 0);
          await p.close();
        },
      );
      await t.test(
        "Timelapse records committed edits, skips paused edits, survives reload, and exports decodable video",
        async () => {
          const p = await open();
          await blank(p);
          await p.locator("#timelapse-open").click();
          await p.locator("#timelapse-start").click();
          assert.equal(
            await p.locator("#timelapse-count").textContent(),
            "1/240 frames",
          );
          await p.locator("#timelapse-dialog .close-dialog").click();
          await stroke(p);
          await p.locator("#timelapse-open").click();
          assert.equal(
            await p.locator("#timelapse-count").textContent(),
            "2/240 frames",
          );
          await p.locator("#timelapse-pause").click();
          await p.locator("#timelapse-dialog .close-dialog").click();
          await stroke(p, 0.6);
          await p.locator("#timelapse-open").click();
          assert.equal(
            await p.locator("#timelapse-count").textContent(),
            "2/240 frames",
          );
          await p.locator("#timelapse-pause").click();
          await p.locator("#timelapse-dialog .close-dialog").click();
          await stroke(p, 0.7);
          await p.waitForFunction(
            () =>
              document.getElementById("save-status").textContent ===
              "Saved on this device",
          );
          await p.reload();
          await p.waitForSelector('html[data-ready="true"]');
          await p.locator("#timelapse-open").click();
          await p.waitForFunction(
            () =>
              document.getElementById("timelapse-status").textContent ===
              "Paused",
          );
          assert.equal(
            await p.locator("#timelapse-count").textContent(),
            "4/240 frames",
          );
          const video = await download(p, "#timelapse-export");
          assert.match(video.filename, /\.(webm|mp4)$/);
          assert.ok(video.bytes.length > 300);
          const dimensions = await p.evaluate(async (data) => {
            const v = document.createElement("video");
            v.muted = true;
            v.src = "data:video/webm;base64," + data;
            await new Promise((resolve, reject) => {
              v.onloadeddata = resolve;
              v.onerror = reject;
            });
            return [v.videoWidth, v.videoHeight];
          }, video.bytes.toString("base64"));
          assert.deepEqual(dimensions, [600, 400]);
          await p.locator(".timelapse-reset summary").click();
          await p.locator("#timelapse-reset").click();
          assert.equal(
            await p.locator("#timelapse-count").textContent(),
            "4/240 frames",
          );
          await p.locator("#timelapse-confirm-reset").check();
          await p.locator("#timelapse-reset").click();
          assert.equal(
            await p.locator("#timelapse-count").textContent(),
            "0/240 frames",
          );
          await p.close();
        },
      );
      await t.test(
        "Folders, favorites, search, sorting, and duplicates persist through autosave without losing originals",
        async () => {
          const p = await open();
          await blank(p, "Gallery original");
          await stroke(p);
          await p.locator("#gallery-button").click();
          await p.locator("#gallery-dialog").waitFor({ state: "visible" });
          await p.locator("#new-folder-name").fill("Illustrations");
          await p.locator("#create-folder").click();
          const entry = p.locator(".gallery-entry").filter({
            has: p.locator("strong", { hasText: "Gallery original" }),
          });
          await entry.locator("select").selectOption("Illustrations");
          await entry.locator("button[aria-pressed]").click();
          await p.locator("#gallery-favorites").click();
          await p.locator("#gallery-search").fill("Gallery original");
          await p.waitForFunction(
            () => document.querySelectorAll(".gallery-card").length === 1,
          );
          await p.locator("#gallery-folder").selectOption("Illustrations");
          await entry.locator(".gallery-entry-actions button").nth(1).click();
          await p.waitForFunction(
            () => document.querySelectorAll(".gallery-card").length === 2,
          );
          await p.locator("#gallery-sort").selectOption("name");
          await p.locator("#gallery-dialog .close-dialog").click();
          await stroke(p, 0.65);
          await p.waitForFunction(
            () =>
              document.getElementById("save-status").textContent ===
              "Saved on this device",
          );
          await p.reload();
          await p.waitForSelector('html[data-ready="true"]');
          await p.locator("#gallery-button").click();
          await p.locator("#gallery-dialog").waitFor({ state: "visible" });
          const reloaded = p.locator(".gallery-entry").filter({
            has: p.locator("strong", { hasText: /^Gallery original$/ }),
          });
          assert.equal(
            await reloaded.locator("select").inputValue(),
            "Illustrations",
          );
          assert.equal(
            await reloaded
              .locator("button[aria-pressed]")
              .getAttribute("aria-pressed"),
            "true",
          );
          assert.equal(await p.locator(".gallery-card").count(), 3);
          const concurrent = await p.evaluate(async () => {
            const storage = await import("/src/storage.js");
            const id = localStorage.getItem("drawsketch.last-document");
            const record = await storage.getDocument(id);
            await Promise.all([
              storage.updateOrganization(id, { folder: "Concurrent folder" }),
              storage.updateOrganization(id, { favorite: false }),
              storage.saveDocument({
                ...record,
                title: "Concurrent save",
                updatedAt: Date.now(),
                data: {
                  ...record.data,
                  title: "Concurrent save",
                  titleKey: "",
                },
              }),
            ]);
            return storage.getDocument(id);
          });
          assert.deepEqual(concurrent.organization, {
            folder: "Concurrent folder",
            favorite: false,
          });
          assert.equal(concurrent.data.title, "Concurrent save");
          await p.close();
        },
      );
      await t.test(
        "IndexedDB v2 upgrades in place and keeps the saved document readable",
        async () => {
          const context = await browser.newContext(),
            p = await context.newPage();
          p.on("pageerror", (e) => errors.push(e.message));
          await p.route("**/seed.html", (route) =>
            route.fulfill({
              contentType: "text/html",
              body: "<!doctype html><title>Migration fixture</title>",
            }),
          );
          await p.goto(server.url + "/seed.html");
          await p.evaluate(async () => {
            const c = document.createElement("canvas");
            c.width = c.height = 64;
            const record = {
              id: "legacy-canvas",
              title: "Legacy drawing",
              updatedAt: Date.now(),
              thumbnail: c.toDataURL(),
              data: {
                format: "drawsketch",
                version: 2,
                id: "legacy-canvas",
                title: "Legacy drawing",
                width: 64,
                height: 64,
                background: "white",
                activeId: "layer-1",
                layers: [
                  {
                    id: "layer-1",
                    name: "Original",
                    visible: true,
                    locked: false,
                    opacity: 1,
                    blend: "source-over",
                    image: c.toDataURL(),
                  },
                ],
              },
            };
            await new Promise((resolve, reject) => {
              const request = indexedDB.open("drawsketch-studio", 2);
              request.onupgradeneeded = () => {
                request.result.createObjectStore("documents", {
                  keyPath: "id",
                });
                request.result
                  .createObjectStore("versions", { keyPath: "key" })
                  .createIndex("documentId", "documentId");
              };
              request.onsuccess = () => {
                const db = request.result,
                  tx = db.transaction("documents", "readwrite");
                tx.objectStore("documents").put(record);
                tx.oncomplete = () => {
                  db.close();
                  resolve();
                };
                tx.onerror = reject;
              };
              request.onerror = reject;
            });
            localStorage.setItem("drawsketch.last-document", "legacy-canvas");
          });
          await p.goto(server.url);
          await p.waitForSelector('html[data-ready="true"]');
          assert.equal(
            await p.locator("#document-name").inputValue(),
            "Legacy drawing",
          );
          assert.equal(
            await p.locator(".layer-name").textContent(),
            "Original",
          );
          const version = await p.evaluate(
            () =>
              new Promise((resolve, reject) => {
                const r = indexedDB.open("drawsketch-studio");
                r.onsuccess = () => {
                  const v = r.result.version;
                  r.result.close();
                  resolve(v);
                };
                r.onerror = reject;
              }),
          );
          assert.equal(version, 3);
          await context.close();
        },
      );
      await t.test(
        "Phone and tablet controls fit and diagnostic scratchpad reports pressure without changing artwork",
        async () => {
          for (const width of [390, 820]) {
            const p = await open({
              viewport: { width, height: 844 },
              hasTouch: true,
              isMobile: width === 390,
            });
            await p.locator("#references-open").click();
            const panel = await p.locator("#reference-panel").boundingBox();
            assert.ok(panel.x >= 0 && panel.x + panel.width <= width);
            await p.locator("#reference-close").click();
            await p.locator("#choose-brush").click();
            assert.ok(
              (await p.locator("#brush-dialog").boundingBox()).width <= width,
            );
            await p.locator("#brush-dialog-done").click();
            await p.locator("#settings-button").click();
            await p.locator("#diagnostics-open").click();
            const box = await p.locator("#diagnostics-canvas").boundingBox(),
              cdp = await p.context().newCDPSession(p);
            for (const [type, x, force] of [
              ["mousePressed", 20, 0.2],
              ["mouseMoved", 80, 0.8],
              ["mouseReleased", 80, 0],
            ])
              await cdp.send("Input.dispatchMouseEvent", {
                type,
                x: box.x + x,
                y: box.y + 30,
                button: "left",
                buttons: type === "mouseReleased" ? 0 : 1,
                clickCount: 1,
                force,
                tiltX: 30,
                tiltY: 15,
                pointerType: "pen",
              });
            await cdp.detach();
            const report = JSON.parse(
              (await download(p, "#diagnostics-export")).bytes,
            );
            assert.ok(Math.abs(report.pressureMin - 0.2) < 1e-6);
            assert.ok(Math.abs(report.pressureMax - 0.8) < 1e-6);
            assert.equal(
              report.appVersion,
              JSON.parse(
                await readFile(
                  new URL("../package.json", import.meta.url),
                  "utf8",
                ),
              ).version,
            );
            await p.locator("#diagnostics-dialog .close-dialog").click();
            await p.locator("#settings-button").click();
            await p.locator("#updates-open").click();
            assert.equal(await p.locator("#updates-check").isDisabled(), true);
            assert.match(
              await p.locator("#updates-status").textContent(),
              /0\.4\.0/,
            );
            assert.equal(
              await p.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
              ),
              true,
            );
            await p.close();
          }
        },
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      server.stop();
    }
  },
);
