import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { launchBrowser, serve } from "../scripts/browser.mjs";
import {
  neutralAdjustments,
  adjustPixels,
  extractColors,
  validPalettes,
  validAdjustments,
} from "../src/color-model.js";
import {
  defaultShortcuts,
  normalizeControls,
  validShortcuts,
} from "../src/controls-model.js";
import { appendFrame, frameBytes } from "../src/recording-model.js";

test("Color transforms preserve transparency; extraction and portable palettes validate real input", () => {
  const source = new Uint8ClampedArray([100, 80, 40, 128, 99, 66, 33, 0]);
  assert.deepEqual(
    [...adjustPixels(source.slice(), neutralAdjustments)],
    [...source],
  );
  const brighter = adjustPixels(source.slice(), {
    ...neutralAdjustments,
    brightness: 50,
  });
  assert.deepEqual([...brighter], [150, 120, 60, 128, 99, 66, 33, 0]);
  const gray = adjustPixels(source.slice(), {
    ...neutralAdjustments,
    saturation: -100,
  });
  assert.equal(gray[0], gray[1]);
  assert.equal(gray[1], gray[2]);
  assert.equal(gray[3], 128);
  assert.equal(validAdjustments({ ...neutralAdjustments, hue: 200 }), false);
  const pixels = new Uint8ClampedArray([
    255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 255, 255, 12, 34, 56, 0,
  ]);
  assert.deepEqual(extractColors(pixels), ["#ff0000", "#0000ff"]);
  const palette = { id: "p", name: "My palette", colors: ["#ff0000"] };
  assert.equal(validPalettes([palette], ["#0000ff"]), true);
  assert.equal(validPalettes([palette, palette]), false);
  assert.equal(validPalettes([{ ...palette, colors: ["red"] }]), false);
});
test("Shortcut maps reject collisions and reserved keys and restore malformed preferences safely", () => {
  assert.equal(validShortcuts(defaultShortcuts), true);
  assert.equal(validShortcuts({ ...defaultShortcuts, brush: "e" }), false);
  assert.equal(validShortcuts({ ...defaultShortcuts, brush: " " }), false);
  assert.equal(validShortcuts({ ...defaultShortcuts, brush: "x" }), true);
  assert.deepEqual(
    normalizeControls({ shortcuts: { brush: "x" }, handedness: "left" })
      .shortcuts,
    defaultShortcuts,
  );
});
test("Adaptive recording retains first/latest chronological frames for thousands of edits within both bounds", () => {
  let journal = { frames: [], interval: 1, compactions: 0 };
  for (let n = 0; n < 3000; n++) {
    journal = appendFrame(
      journal,
      "frame-" + String(n).padStart(4, "0"),
      40,
      1000,
    );
    assert.ok(journal.frames.length <= 40);
    assert.ok(frameBytes(journal.frames) <= 1000);
    assert.equal(journal.frames[0], "frame-0000");
    assert.equal(journal.frames.at(-1), "frame-" + String(n).padStart(4, "0"));
  }
  assert.ok(journal.compactions > 0);
  assert.ok(journal.interval > 1);
  assert.deepEqual([...journal.frames].sort(), journal.frames);
  const old = { frames: ["old"], interval: 1, compactions: 0 };
  const result = appendFrame(old, "x".repeat(100), 40, 10);
  assert.equal(result.full, true);
  assert.deepEqual(result.frames, ["old"]);
});

test(
  "v0.5 precision studio: navigation, portable colors, adjustments, comfort, recording and performance",
  { timeout: 180_000 },
  async (t) => {
    const server = await serve({ port: 5185 }),
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
    const range = (p, id, value) =>
      p.locator("#" + id).evaluate((el, value) => {
        el.value = value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }, String(value));
    async function blank(p, w = 600, h = 400) {
      await p.locator("#new-document").click();
      await p.locator("#new-name").fill("Precision drawing");
      await p.locator("#new-width").fill(String(w));
      await p.locator("#new-height").fill(String(h));
      await p.locator("#new-form button[type=submit]").click();
      await p.locator("#new-dialog").waitFor({ state: "hidden" });
      await p.locator("#choose-brush").click();
      await p.locator("#brush-dialog [data-brush=ink]").click();
      await p.locator("#brush-dialog-done").click();
    }
    const color = async (p, value) => {
      await p.locator("#hex-input").fill(value);
      await p.locator("#hex-input").dispatchEvent("change");
    };
    const pixel = (p, x = 100, y = 100) =>
      p
        .locator("#drawing-canvas")
        .evaluate(
          (el, [x, y]) => [
            ...el.getContext("2d").getImageData(x, y, 1, 1).data,
          ],
          [x, y],
        );
    async function fill(p, value) {
      await color(p, value);
      await p.locator("[data-tool=fill]").click();
      const b = await p.locator("#drawing-canvas").boundingBox();
      await p.mouse.click(b.x + b.width * 0.5, b.y + b.height * 0.5);
      await p.waitForFunction(() => !document.getElementById("undo").disabled);
    }
    async function download(p, selector) {
      const pending = p.waitForEvent("download");
      await p.locator(selector).click();
      const d = await pending;
      return JSON.parse(await readFile(await d.path(), "utf8"));
    }
    async function controls(p) {
      await p.locator("#settings-button").click();
      await p.locator("#workspace-open").click();
    }
    async function quick(p, action) {
      await p.locator(`[data-quick-action=${action}]`).click();
    }
    try {
      await t.test(
        "Navigator centers the actual rotated canvas, follows zoom, and leaves artwork unchanged",
        async () => {
          const p = await open();
          await blank(p);
          const before = await p
            .locator("#drawing-canvas")
            .evaluate((c) => c.toDataURL());
          await quick(p, "navigator");
          await range(p, "navigator-zoom", 200);
          await p.locator("#rotate-canvas").click();
          const point = await p.locator("#navigator-canvas").evaluate((c) => {
            const scale = Math.min((c.width - 12) / 600, (c.height - 12) / 400),
              x = (c.width - 600 * scale) / 2,
              y = (c.height - 400 * scale) / 2,
              b = c.getBoundingClientRect();
            return {
              x: b.x + ((x + 450 * scale) * b.width) / c.width,
              y: b.y + ((y + 100 * scale) * b.height) / c.height,
            };
          });
          await p.mouse.click(point.x, point.y);
          const centered = await p.evaluate(() => {
            const shell = document.getElementById("canvas-shell"),
              view = document.getElementById("canvas-viewport"),
              m = new DOMMatrix(getComputedStyle(shell).transform).inverse();
            const origin = getComputedStyle(shell)
              .transformOrigin.split(" ")
              .map(parseFloat);
            const p = new DOMPoint(
              view.clientWidth / 2 - shell.offsetLeft - origin[0],
              view.clientHeight / 2 - shell.offsetTop - origin[1],
            ).matrixTransform(m);
            return { x: p.x + origin[0], y: p.y + origin[1] };
          });
          assert.ok(Math.abs(centered.x - 450) < 3);
          assert.ok(Math.abs(centered.y - 100) < 3);
          assert.equal(
            await p.locator("#navigator-rotation").textContent(),
            "15°",
          );
          assert.equal(
            await p.locator("#drawing-canvas").evaluate((c) => c.toDataURL()),
            before,
          );
          await p.close();
        },
      );
      await t.test(
        "Palettes, favorites and extracted colors survive project export/reopen and invalid metadata is rejected",
        async () => {
          const p = await open();
          await blank(p);
          await color(p, "#ff0000");
          const before = await p
            .locator("#drawing-canvas")
            .evaluate((c) => c.toDataURL());
          await quick(p, "palettes");
          await p.locator("#palette-name").fill("Illustration colors");
          await p.locator("#palette-create").click();
          await p.locator("#palette-add-color").click();
          await p.locator("#palette-star").click();
          const png = await p.evaluate(() => {
            const c = document.createElement("canvas");
            c.width = 128;
            c.height = 64;
            const x = c.getContext("2d");
            x.fillStyle = "#0000ff";
            x.fillRect(0, 0, 64, 64);
            x.fillStyle = "#00ff00";
            x.fillRect(64, 0, 64, 64);
            return c.toDataURL();
          });
          await p.locator("#palette-file").setInputFiles({
            name: "colors.png",
            mimeType: "image/png",
            buffer: Buffer.from(png.split(",")[1], "base64"),
          });
          await p.waitForFunction(
            () =>
              document.querySelectorAll("#palette-colors button").length === 3,
          );
          await p.locator("#palettes-dialog .close-dialog").click();
          const project = await download(p, "#save-project");
          assert.equal(project.version, 4);
          assert.deepEqual(
            new Set(project.palettes[0].colors),
            new Set(["#ff0000", "#0000ff", "#00ff00"]),
          );
          assert.deepEqual(project.favoriteColors, ["#ff0000"]);
          assert.equal(
            await p.locator("#drawing-canvas").evaluate((c) => c.toDataURL()),
            before,
          );
          await p.locator("#project-file").setInputFiles({
            name: "colors.drawsketch",
            mimeType: "application/json",
            buffer: Buffer.from(JSON.stringify(project)),
          });
          await p.waitForFunction(() =>
            document
              .getElementById("toast")
              .textContent.includes("Project opened"),
          );
          await quick(p, "palettes");
          assert.equal(
            await p.locator("#palette-select option").textContent(),
            "Illustration colors",
          );
          await p.locator("#palette-favorites-only").check();
          assert.equal(await p.locator("#palette-colors button").count(), 1);
          await p.locator("#palettes-dialog .close-dialog").click();
          await p.locator("#project-file").setInputFiles({
            name: "invalid.drawsketch",
            mimeType: "application/json",
            buffer: Buffer.from(
              JSON.stringify({
                ...project,
                palettes: [{ ...project.palettes[0], colors: ["invalid"] }],
              }),
            ),
          });
          await p.waitForFunction(() =>
            document
              .getElementById("toast")
              .textContent.includes("not a valid"),
          );
          const unchanged = await download(p, "#save-project");
          assert.deepEqual(unchanged.palettes, project.palettes);
          await p.close();
        },
      );
      await t.test(
        "Adjustment previews cancel, persist and undo; duplication/merge preserve visible pixels and raw painting stays original",
        async () => {
          const p = await open();
          await blank(p);
          await fill(p, "#646464");
          assert.deepEqual(await pixel(p), [100, 100, 100, 255]);
          const original = await download(p, "#save-project");
          await p.locator("#document-name").fill("Preview save");
          await p.locator("#document-name").dispatchEvent("change");
          await quick(p, "adjustments");
          await range(p, "adjust-brightness", 80);
          await p.waitForFunction(
            () =>
              document
                .getElementById("drawing-canvas")
                .getContext("2d")
                .getImageData(100, 100, 1, 1).data[0] >= 179,
          );
          await p.waitForFunction(async () => {
            const { getDocument } = await import("/src/storage.js");
            const record = await getDocument(
              localStorage.getItem("drawsketch.last-document"),
            );
            return (
              record?.data.title === "Preview save" &&
              record.data.layers[0].adjustments.brightness === 0
            );
          });
          await p
            .locator("#adjustments-dialog button[data-i18n=cancel]")
            .click();
          assert.deepEqual(await pixel(p), [100, 100, 100, 255]);
          await quick(p, "adjustments");
          await range(p, "adjust-brightness", 50);
          await p.locator("#adjust-apply").click();
          assert.ok(Math.abs((await pixel(p))[0] - 150) <= 1);
          const project = await download(p, "#save-project");
          assert.equal(project.layers[0].image, original.layers[0].image);
          assert.equal(project.layers[0].adjustments.brightness, 50);
          await p.locator("#undo").click();
          await p.waitForFunction(
            () =>
              document
                .getElementById("drawing-canvas")
                .getContext("2d")
                .getImageData(100, 100, 1, 1).data[0] === 100,
          );
          await p.locator("#redo").click();
          await p.waitForFunction(
            () =>
              document
                .getElementById("drawing-canvas")
                .getContext("2d")
                .getImageData(100, 100, 1, 1).data[0] >= 149,
          );
          await p.waitForFunction(
            () =>
              document.getElementById("save-status").textContent ===
              "Saved on this device",
          );
          await p.reload();
          await p.waitForSelector('html[data-ready="true"]');
          assert.ok(Math.abs((await pixel(p))[0] - 150) <= 1);
          await p.locator("#duplicate-layer").click();
          assert.ok(Math.abs((await pixel(p))[0] - 150) <= 1);
          await p.locator("#merge-layer").click();
          assert.ok(Math.abs((await pixel(p))[0] - 150) <= 1);
          const merged = await download(p, "#save-project");
          assert.deepEqual(merged.layers[0].adjustments, neutralAdjustments);
          await p.close();
        },
      );
      await t.test(
        "Cached adjustments, masks and clipping invalidate only when their dependent pixels change",
        async () => {
          const p = await open();
          const result = await p.evaluate(async () => {
            const { surface, dirty, effectiveLayer, renderScene } =
              await import("/src/canvas.js");
            const { neutralAdjustments } = await import("/src/color-model.js");
            const base = {
              id: "base",
              canvas: surface(64, 64),
              visible: true,
              opacity: 1,
              blend: "source-over",
              adjustments: { ...neutralAdjustments },
            };
            base.canvas.getContext("2d").fillRect(0, 0, 32, 64);
            dirty(base.canvas);
            const clip = {
              id: "clip",
              canvas: surface(64, 64),
              visible: true,
              opacity: 1,
              blend: "source-over",
              clipping: true,
              adjustments: { ...neutralAdjustments, brightness: 50 },
            };
            const x = clip.canvas.getContext("2d");
            x.fillStyle = "#646464";
            x.fillRect(0, 0, 64, 64);
            dirty(clip.canvas);
            clip.mask = surface(64, 64);
            clip.mask.getContext("2d").fillRect(0, 0, 64, 64);
            dirty(clip.mask);
            const output = surface(64, 64),
              ctx = output.getContext("2d");
            renderScene(ctx, [base, clip], [], 64, 64);
            const revision = clip._clipped._studioRevision,
              adjusted = clip._adjusted;
            renderScene(ctx, [base, clip], [], 64, 64);
            const cached =
              revision === clip._clipped._studioRevision &&
              adjusted === clip._adjusted;
            base.canvas.getContext("2d").fillRect(32, 0, 32, 64);
            dirty(base.canvas);
            renderScene(ctx, [base, clip], [], 64, 64);
            const right = ctx.getImageData(50, 20, 1, 1).data[0];
            clip.mask.getContext("2d").clearRect(0, 0, 20, 64);
            dirty(clip.mask);
            renderScene(ctx, [base, clip], [], 64, 64);
            const left = ctx.getImageData(5, 20, 1, 1).data[0];
            base.groupId = clip.groupId = "g";
            const group = { id: "g", visible: true, opacity: 1 };
            renderScene(ctx, [base, clip], [group], 64, 64);
            renderScene(
              ctx,
              [base, clip],
              [group],
              64,
              64,
              "white",
              null,
              (layer) =>
                layer.id === "clip"
                  ? effectiveLayer({
                      ...clip,
                      adjustments: { ...neutralAdjustments, brightness: 100 },
                      _adjusted: null,
                      _adjustSignature: null,
                      _masked: null,
                      _maskSignature: null,
                    })
                  : null,
            );
            const groupPreview = ctx.getImageData(50, 20, 1, 1).data[0];
            renderScene(ctx, [base, clip], [group], 64, 64);
            const groupRestored = ctx.getImageData(50, 20, 1, 1).data[0];
            return {
              groupPreview,
              groupRestored,
              cached,
              right,
              left,
              raw: clip.canvas.getContext("2d").getImageData(5, 20, 1, 1)
                .data[0],
              maskedAlpha: effectiveLayer(clip)
                .getContext("2d")
                .getImageData(5, 20, 1, 1).data[3],
            };
          });
          assert.ok(Math.abs(result.groupPreview - 200) <= 1);
          assert.ok(Math.abs(result.groupRestored - 150) <= 1);
          assert.equal(result.cached, true);
          assert.ok(Math.abs(result.right - 150) <= 1);
          assert.equal(result.left, 0);
          assert.equal(result.raw, 100);
          assert.equal(result.maskedAlpha, 0);
          await p.close();
        },
      );
      await t.test(
        "Left-handed controls and remapped shortcuts persist on phone/tablet; benchmark leaves artwork intact",
        async () => {
          for (const width of [390, 820]) {
            const p = await open({
              viewport: { width, height: 844 },
              hasTouch: true,
              isMobile: width === 390,
            });
            await controls(p);
            await p.locator("#handedness").selectOption("left");
            await p
              .locator("#comfort-dialog details")
              .nth(1)
              .evaluate((el) => (el.open = true));
            await p.locator("[data-shortcut=brush]").fill("e");
            await p.locator("[data-shortcut=brush]").dispatchEvent("change");
            assert.equal(
              await p.locator("[data-shortcut=brush]").inputValue(),
              "b",
            );
            await p.locator("[data-shortcut=brush]").fill("x");
            await p.locator("[data-shortcut=brush]").dispatchEvent("change");
            await p
              .locator('[data-quick-slot="3"]')
              .selectOption("performance");
            await p.locator("#comfort-dialog .close-dialog").first().click();
            await p.locator("#drawing-canvas").focus();
            await p.keyboard.press("e");
            await p.keyboard.press("x");
            assert.equal(
              await p.locator("[data-tool=brush]").getAttribute("aria-pressed"),
              "true",
            );
            assert.match(
              await p.locator("[data-tool=brush]").getAttribute("title"),
              /\(X\)/,
            );
            const b = await p.locator(".tool-palette").boundingBox();
            assert.ok(b.x > width / 2);
            assert.equal(
              await p.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
              ),
              true,
            );
            await p.reload();
            await p.waitForSelector('html[data-ready="true"]');
            assert.equal(
              await p.locator("body").getAttribute("data-handedness"),
              "left",
            );
            assert.equal(
              await p.locator("[data-quick-action=performance]").count(),
              1,
            );
            const before = await p
              .locator("#drawing-canvas")
              .evaluate((c) => c.toDataURL());
            await quick(p, "performance");
            await p.locator("#benchmark-run").click();
            await p.waitForFunction(() =>
              document
                .getElementById("benchmark-result")
                .textContent.includes("400 brush segments"),
            );
            const report = await download(p, "#performance-export");
            assert.equal(report.format, "drawsketch-performance");
            assert.equal(report.benchmark.fixture.layers, 8);
            assert.ok(report.benchmark.brushMs > 0);
            assert.ok(report.memoryEstimate.canvasBytes > 0);
            assert.ok(report.measurements.render.samples > 0);
            assert.equal(
              await p.locator("#drawing-canvas").evaluate((c) => c.toDataURL()),
              before,
            );
            await p.close();
          }
        },
      );
      await t.test(
        "A full legacy recording compacts adaptively, keeps its first/latest frame and reopens paused",
        async () => {
          const p = await open();
          await blank(p, 64, 64);
          await p.waitForFunction(
            () =>
              document.getElementById("save-status").textContent ===
              "Saved on this device",
          );
          const first = await p.evaluate(async () => {
            const { patchWorkspace } = await import("/src/storage.js");
            const c = document.createElement("canvas");
            c.width = c.height = 64;
            const x = c.getContext("2d"),
              frames = [];
            for (let i = 0; i < 240; i++) {
              x.fillStyle = `rgb(${i},0,0)`;
              x.fillRect(0, 0, 64, 64);
              frames.push(c.toDataURL("image/jpeg", 0.8));
            }
            await patchWorkspace(
              localStorage.getItem("drawsketch.last-document"),
              { timelapse: { frames, status: "paused" } },
            );
            return frames[0];
          });
          await p.reload();
          await p.waitForSelector('html[data-ready="true"]');
          await p.locator("#timelapse-open").click();
          await p.waitForFunction(
            () =>
              document.getElementById("timelapse-status").textContent ===
              "Paused",
          );
          await p.locator("#timelapse-pause").click();
          assert.match(
            await p.locator("#timelapse-status").textContent(),
            /Recording/,
          );
          assert.match(
            await p.locator("#timelapse-storage").textContent(),
            /per 2 edits/,
          );
          await p.locator("#timelapse-stop").click();
          await p.locator("#timelapse-dialog .close-dialog").click();
          const data = await p.evaluate(async () => {
            const { getWorkspace } = await import("/src/storage.js");
            return (
              await getWorkspace(
                localStorage.getItem("drawsketch.last-document"),
              )
            ).timelapse;
          });
          assert.ok(data.frames.length < 240);
          assert.equal(data.frames[0], first);
          assert.ok(data.interval >= 2);
          assert.notEqual(data.frames.at(-1), first);
          await p.close();
        },
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      server.stop();
    }
  },
);
