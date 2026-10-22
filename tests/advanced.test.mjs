import assert from "node:assert/strict";
import { test } from "node:test";
import { launchBrowser, serve } from "../scripts/browser.mjs";
import { trimHistory } from "../src/history.js";
import { fillPixels } from "../src/fill.js";

const white = [255, 255, 255, 255],
  red = [255, 0, 0, 255],
  blue = [0, 0, 255, 255];
test("History budgets count shared images once and retain the newest recoverable state", () => {
  const shared = "a".repeat(100),
    entries = Array.from({ length: 6 }, () => ({
      layers: [{ image: shared }],
    }));
  assert.equal(trimHistory(entries, 210), 200);
  assert.equal(entries.length, 6);
  entries.push({ layers: [{ image: "b".repeat(100) }] });
  trimHistory(entries, 210);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].layers[0].image[0], "b");
});
test("Scanline fill stops at opaque barriers and respects tolerance and canvas bounds", () => {
  const pixels = new Uint8ClampedArray(8 * 6 * 4);
  for (let y = 0; y < 6; y++) pixels.set([0, 0, 0, 255], (y * 8 + 4) * 4);
  assert.equal(
    fillPixels(
      pixels,
      8,
      6,
      { x: 1, y: 1 },
      { color: "#ff0000", opacity: 100, tolerance: 0 },
    ),
    true,
  );
  assert.deepEqual([...pixels.slice(0, 4)], red);
  assert.deepEqual([...pixels.slice(5 * 4, 6 * 4)], [0, 0, 0, 0]);
  assert.equal(
    fillPixels(
      pixels,
      8,
      6,
      { x: -1, y: 0 },
      { color: "#ff0000", opacity: 100, tolerance: 0 },
    ),
    false,
  );
});

test(
  "Advanced studio operations preserve pixels, project data, and recovery",
  { timeout: 180_000 },
  async (t) => {
    const server = await serve({ port: 5181 }),
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
      p.locator("#" + id).evaluate((el, v) => {
        el.value = v;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }, String(value));
    const color = async (p, value) => {
      await p.locator("#hex-input").fill(value);
      await p.locator("#hex-input").dispatchEvent("change");
    };
    const pixel = (p, x, y) =>
      p
        .locator("#drawing-canvas")
        .evaluate(
          (el, [x, y]) => [
            ...el.getContext("2d").getImageData(x, y, 1, 1).data,
          ],
          [x, y],
        );
    async function coords(p, x, y) {
      const b = await p.locator("#drawing-canvas").boundingBox(),
        s = await p
          .locator("#drawing-canvas")
          .evaluate((el) => [el.width, el.height]);
      return { x: b.x + (x * b.width) / s[0], y: b.y + (y * b.height) / s[1] };
    }
    async function drag(p, a, b) {
      a = await coords(p, ...a);
      b = await coords(p, ...b);
      await p.mouse.move(a.x, a.y);
      await p.mouse.down();
      await p.mouse.move(b.x, b.y, { steps: 12 });
      await p.mouse.up();
    }
    async function blank(p, name = "Advanced canvas", w = 600, h = 400) {
      await p.locator("#new-document").click();
      await p.locator("#new-name").fill(name);
      await p.locator("#new-width").fill(String(w));
      await p.locator("#new-height").fill(String(h));
      await p.locator("#new-form button[type=submit]").click();
      await p.locator("#new-dialog").waitFor({ state: "hidden" });
      await p.locator(".brush-panel [data-brush=ink]").click();
      await range(p, "brush-size", 20);
    }
    const advanced = (p) =>
      p.locator(".layer-studio").evaluate((el) => (el.open = true));
    async function download(p, selector) {
      const pending = p.waitForEvent("download");
      await p.locator(selector).click();
      const d = await pending,
        stream = await d.createReadStream(),
        chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      return JSON.parse(Buffer.concat(chunks).toString());
    }
    async function saved(p) {
      await p.waitForFunction(
        () =>
          document.getElementById("save-status").textContent ===
          "Saved on this device",
      );
    }
    try {
      await t.test(
        "Rectangle transforms flip, scale, rotate, cancel, move, and undo without losing the source",
        async () => {
          const p = await open();
          await blank(p);
          await color(p, "#FF0000");
          await drag(p, [180, 140], [220, 140]);
          await color(p, "#0000FF");
          await drag(p, [260, 140], [300, 140]);
          await p.locator("[data-tool=select]").click();
          await drag(p, [160, 110], [320, 170]);
          await p.locator("#selection-transform").click();
          await p.locator("#transform-x").fill("400");
          await p.locator("#transform-flip-x").check();
          await p.locator("#transform-apply").click();
          assert.deepEqual(await pixel(p, 200, 140), white);
          assert.deepEqual(await pixel(p, 440, 140), red);
          assert.deepEqual(await pixel(p, 360, 140), blue);
          await p.locator("#undo").click();
          await p.waitForFunction(
            () => !document.getElementById("redo").disabled,
          );
          assert.deepEqual(await pixel(p, 200, 140), red);
          assert.deepEqual(await pixel(p, 280, 140), blue);
          await p.locator("#selection-all").click();
          await p.locator("#selection-transform").click();
          await p.locator("#transform-angle").fill("90");
          await p.locator("#transform-width").fill("300");
          await p.locator("#transform-height").fill("200");
          await p.locator("#transform-cancel").click();
          assert.deepEqual(await pixel(p, 200, 140), red);
          await drag(p, [160, 110], [320, 170]);
          await p.locator("#selection-transform").click();
          await p.locator("#transform-angle").fill("90");
          await p.locator("#transform-apply").click();
          assert.deepEqual(await pixel(p, 240, 100), red);
          assert.deepEqual(await pixel(p, 240, 180), blue);
          await p.locator("#selection-all").click();
          await p.locator("[data-tool=move]").click();
          await drag(p, [240, 140], [340, 240]);
          assert.deepEqual(await pixel(p, 340, 200), red);
          assert.deepEqual(await pixel(p, 240, 100), white);
          await p.close();
        },
      );
      await t.test(
        "Lasso limits painting to its polygon and selection erasing is undoable",
        async () => {
          const p = await open();
          await blank(p);
          await p.locator("[data-tool=lasso]").click();
          const points = [
            [140, 80],
            [320, 80],
            [230, 260],
            [140, 80],
          ];
          let a = await coords(p, ...points[0]);
          await p.mouse.move(a.x, a.y);
          await p.mouse.down();
          for (const point of points.slice(1)) {
            a = await coords(p, ...point);
            await p.mouse.move(a.x, a.y, { steps: 8 });
          }
          await p.mouse.up();
          await p.locator("[data-tool=brush]").click();
          await color(p, "#FF0000");
          await drag(p, [120, 160], [340, 160]);
          assert.deepEqual(await pixel(p, 230, 160), red);
          assert.deepEqual(await pixel(p, 150, 160), white);
          assert.deepEqual(await pixel(p, 310, 160), white);
          await p.locator("#selection-erase").click();
          assert.deepEqual(await pixel(p, 230, 160), white);
          await p.locator("#undo").click();
          await p.waitForFunction(
            () => !document.getElementById("redo").disabled,
          );
          assert.deepEqual(await pixel(p, 230, 160), red);
          await p.close();
        },
      );
      await t.test(
        "Masks hide and reveal non-destructively; native project and reload preserve the mask",
        async () => {
          const p = await open();
          await blank(p);
          await color(p, "#FF0000");
          await drag(p, [180, 140], [320, 140]);
          await advanced(p);
          await p.locator("#add-mask").click();
          await drag(p, [250, 100], [250, 180]);
          assert.deepEqual(await pixel(p, 250, 140), white);
          assert.deepEqual(await pixel(p, 190, 140), red);
          const project = await download(p, "#save-project");
          assert.equal(project.version, 4);
          assert.ok(project.layers[0].mask);
          const raw = await p.evaluate(async (data) => {
            const im = new Image();
            im.src = data;
            await im.decode();
            const c = document.createElement("canvas");
            c.width = im.width;
            c.height = im.height;
            const ctx = c.getContext("2d");
            ctx.drawImage(im, 0, 0);
            return [...ctx.getImageData(250, 140, 1, 1).data];
          }, project.layers[0].image);
          assert.deepEqual(raw, red);
          await p.locator("#mask-enabled").uncheck();
          assert.deepEqual(await pixel(p, 250, 140), red);
          await p.locator("#mask-enabled").check();
          await saved(p);
          await p.reload();
          await p.waitForSelector("html[data-ready=true]");
          assert.deepEqual(await pixel(p, 250, 140), white);
          await advanced(p);
          await p.locator("#remove-mask").click();
          assert.deepEqual(await pixel(p, 250, 140), red);
          await p.close();
        },
      );
      await t.test(
        "Alpha lock and clipping constrain paint; groups apply isolated opacity and preserve membership",
        async () => {
          const p = await open();
          await blank(p);
          await color(p, "#FF0000");
          await drag(p, [180, 140], [320, 140]);
          await advanced(p);
          await p.locator("#alpha-lock").check();
          await color(p, "#0000FF");
          await drag(p, [250, 100], [250, 180]);
          assert.deepEqual(await pixel(p, 250, 140), blue);
          assert.deepEqual(await pixel(p, 250, 110), white);
          await p.locator("#alpha-lock").uncheck();
          await p.locator("#new-group").click();
          await p.locator("#add-layer").click();
          await p.locator("#clipping").check();
          await color(p, "#0000FF");
          await drag(p, [290, 100], [290, 180]);
          assert.deepEqual(await pixel(p, 290, 140), blue);
          assert.deepEqual(await pixel(p, 290, 110), white);
          await range(p, "group-opacity", 50);
          const blended = await pixel(p, 290, 140);
          assert.ok(blended[0] >= 126 && blended[0] <= 129);
          assert.equal(blended[2], 255);
          await p.locator("#group-visible").uncheck();
          assert.deepEqual(await pixel(p, 290, 140), white);
          await p.locator("#group-visible").check();
          await p.locator("#rename-group").click();
          await p.locator("#layer-name-input").fill("Paint group");
          await p.locator("#rename-form button[type=submit]").click();
          const project = await download(p, "#save-project");
          assert.equal(project.groups[0].name, "Paint group");
          assert.equal(project.layers[0].groupId, project.layers[1].groupId);
          assert.equal(project.layers[1].clipping, true);
          await p.close();
        },
      );
      await t.test(
        "Brush texture, pickup, tilt, and custom presets affect paint and persist settings",
        async () => {
          const p = await open();
          await blank(p);
          await color(p, "#FF0000");
          await drag(p, [180, 100], [320, 100]);
          await p.locator("#choose-brush").click();
          await p
            .locator(".brush-studio-extra")
            .evaluate((el) => (el.open = true));
          await p.locator("#paper-texture").selectOption("canvas");
          await range(p, "texture-strength", 100);
          await range(p, "color-mix", 55);
          await p.locator("#custom-brush-name").fill("Woven ink");
          await p.locator("#save-brush").click();
          await p.locator("#paper-texture").selectOption("none");
          await range(p, "color-mix", 0);
          await p.locator("#custom-brush-list button").first().click();
          assert.equal(
            await p.locator("#paper-texture").inputValue(),
            "canvas",
          );
          assert.equal(await p.locator("#color-mix").inputValue(), "55");
          await p.locator("#brush-dialog-done").click();
          await drag(p, [180, 180], [320, 180]);
          const textured = await pixel(p, 240, 180);
          assert.ok(textured[1] > 0 && textured[1] < 255);
          await p.locator("#choose-brush").click();
          await p.locator("#paper-texture").selectOption("none");
          await range(p, "color-mix", 100);
          await p.locator("#brush-dialog-done").click();
          await color(p, "#0000FF");
          await drag(p, [200, 100], [300, 100]);
          assert.deepEqual(await pixel(p, 250, 100), red);
          await p.reload();
          await p.waitForSelector("html[data-ready=true]");
          await p.locator("#choose-brush").click();
          await p
            .locator(".brush-studio-extra")
            .evaluate((el) => (el.open = true));
          assert.equal(
            await p.locator("#custom-brush-list button").first().textContent(),
            "Woven ink",
          );
          await p.locator("#custom-brush-list button").first().click();
          await p.locator("#brush-dialog-done").click();
          const cdp = await p.context().newCDPSession(p);
          const point = await coords(p, 400, 260);
          await cdp.send("Input.dispatchMouseEvent", {
            type: "mousePressed",
            ...point,
            button: "left",
            buttons: 1,
            clickCount: 1,
            pointerType: "pen",
            force: 0.5,
            tiltX: 70,
            tiltY: 0,
          });
          await cdp.send("Input.dispatchMouseEvent", {
            type: "mouseReleased",
            ...point,
            button: "left",
            buttons: 0,
            clickCount: 1,
            pointerType: "pen",
          });
          const bounds = await p.locator("#drawing-canvas").evaluate((el) => {
            const data = el
                .getContext("2d")
                .getImageData(365, 225, 70, 70).data,
              xs = [],
              ys = [];
            for (let y = 0; y < 70; y++)
              for (let x = 0; x < 70; x++) {
                if (data[(y * 70 + x) * 4] < 245) {
                  xs.push(x);
                  ys.push(y);
                }
              }
            return [
              Math.max(...xs) - Math.min(...xs),
              Math.max(...ys) - Math.min(...ys),
            ];
          });
          assert.ok(bounds[0] > bounds[1] * 1.5);
          await p.close();
        },
      );
      await t.test(
        "Version restoration opens a copy; backups import atomically and preserve existing canvases",
        async () => {
          const p = await open();
          await blank(p, "Recovery original");
          await color(p, "#FF0000");
          await drag(p, [180, 140], [320, 140]);
          await p.locator("#gallery-button").click();
          await p.locator("#versions-open").click();
          await p.locator("#checkpoint-now").click();
          await p.waitForFunction(
            () =>
              document.getElementById("toast").textContent ===
              "A recovery checkpoint was saved.",
          );
          await p.locator("#versions-dialog .close-dialog").click();
          await color(p, "#0000FF");
          await drag(p, [180, 140], [320, 140]);
          await p.locator("#gallery-button").click();
          await p.locator("#versions-open").click();
          await p.locator("#version-list button").first().click();
          await p.locator("#versions-dialog").waitFor({ state: "hidden" });
          assert.deepEqual(await pixel(p, 250, 140), red);
          await p.locator("#gallery-button").click();
          await p.waitForFunction(
            () => document.querySelectorAll(".gallery-card").length >= 3,
          );
          const count = await p.locator(".gallery-card").count();
          assert.ok(count >= 3);
          const backup = await download(p, "#export-backup");
          assert.equal(backup.format, "drawsketch-backup");
          assert.equal(backup.documents.length, count);
          const malformed = structuredClone(backup);
          malformed.documents.push({
            ...backup.documents[0],
            data: { ...backup.documents[0].data, width: 63 },
          });
          await p.locator("#backup-file").setInputFiles({
            name: "invalid.drawsketch-backup",
            mimeType: "application/json",
            buffer: Buffer.from(JSON.stringify(malformed)),
          });
          await p.waitForFunction(() =>
            document
              .getElementById("toast")
              .textContent.includes("not a valid"),
          );
          assert.equal(await p.locator(".gallery-card").count(), count);
          await p.locator("#backup-file").setInputFiles({
            name: "valid.drawsketch-backup",
            mimeType: "application/json",
            buffer: Buffer.from(JSON.stringify(backup)),
          });
          await p.waitForFunction(
            (n) => document.querySelectorAll(".gallery-card").length === n,
            count * 2,
          );
          await p.close();
        },
      );
      await t.test(
        "Two- and three-finger taps undo and redo, while holding picks color without leaving ink",
        async () => {
          const p = await open({ hasTouch: true });
          await blank(p);
          await color(p, "#FF0000");
          await drag(p, [180, 140], [320, 140]);
          const cdp = await p.context().newCDPSession(p);
          const points = await Promise.all(
            [
              [220, 220],
              [300, 220],
              [380, 220],
            ].map(([x, y]) => coords(p, x, y)),
          );
          const tap = async (n) => {
            for (let count = 1; count <= n; count++)
              await cdp.send("Input.dispatchTouchEvent", {
                type: "touchStart",
                touchPoints: points
                  .slice(0, count)
                  .map((point, i) => ({ ...point, id: i + 1 })),
              });
            await cdp.send("Input.dispatchTouchEvent", {
              type: "touchEnd",
              touchPoints: [],
            });
          };
          await tap(2);
          await p.waitForFunction(
            () => !document.getElementById("redo").disabled,
          );
          assert.deepEqual(await pixel(p, 250, 140), white);
          await tap(3);
          await p.waitForFunction(
            () => document.getElementById("redo").disabled,
          );
          assert.deepEqual(await pixel(p, 250, 140), red);
          await color(p, "#0000FF");
          const target = await coords(p, 250, 140);
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [{ ...target, id: 5 }],
          });
          await p.waitForFunction(
            () =>
              document.getElementById("hex-input").value.toUpperCase() ===
              "#FF0000",
          );
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
          });
          assert.deepEqual(await pixel(p, 250, 140), red);
          await p.close();
        },
      );
      await t.test(
        "Worker fill supports a 16-megapixel canvas and unchanged layers reuse their encoded snapshots",
        async () => {
          const p = await open();
          await blank(p, "Large canvas", 4000, 4000);
          await color(p, "#FF0000");
          await p.locator("[data-tool=fill]").click();
          const point = await coords(p, 2000, 2000);
          await p.mouse.click(point.x, point.y);
          await p.waitForFunction(
            () =>
              document
                .getElementById("drawing-canvas")
                .getContext("2d")
                .getImageData(2000, 2000, 1, 1).data[0] === 255 &&
              document
                .getElementById("drawing-canvas")
                .getContext("2d")
                .getImageData(2000, 2000, 1, 1).data[1] === 0,
          );
          assert.deepEqual(await pixel(p, 3999, 3999), red);
          await p.locator("#add-layer").click();
          const calls = await p.evaluate(async () => {
            const { surface, encoded, dirty } = await import("/src/canvas.js");
            const a = surface(4, 4);
            let calls = 0;
            const encode = a.toDataURL.bind(a);
            a.toDataURL = (...args) => {
              calls++;
              return encode(...args);
            };
            encoded(a);
            encoded(a);
            dirty(a);
            encoded(a);
            return calls;
          });
          assert.equal(calls, 2);
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
