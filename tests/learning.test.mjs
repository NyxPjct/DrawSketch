import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import {
  normalizeGuides,
  beginGuide,
  projectGuide,
} from "../src/guides-model.js";
import { professionalFill, normalizeFill } from "../src/fill-pro.js";
import { normalizeStudy, remainingSeconds } from "../src/study-model.js";
import { launchBrowser, serve } from "../scripts/browser.mjs";

test("Guides project real geometry and preserve input pressure; malformed options recover safely", () => {
  const point = { x: 200, y: 50, pressure: 0.8, tiltX: 20 };
  const ruler = beginGuide(
    normalizeGuides({ mode: "ruler", snap: true }),
    600,
    400,
    point,
  );
  assert.deepEqual(projectGuide(ruler, point), { ...point, y: 200 });
  const ellipse = beginGuide(
    normalizeGuides({ mode: "ellipse", snap: true }),
    600,
    400,
    point,
  );
  const e = projectGuide(ellipse, point);
  assert.ok(
    Math.abs(((e.x - 300) / 180) ** 2 + ((e.y - 200) / 80) ** 2 - 1) < 1e-8,
  );
  const perspective = beginGuide(
    normalizeGuides({ mode: "perspective2", snap: true }),
    600,
    400,
    { x: 300, y: 300 },
  );
  const a = projectGuide(perspective, { x: 400, y: 245 }),
    b = projectGuide(perspective, { x: 500, y: 210 });
  assert.ok(
    Math.abs((a.x - 300) * (b.y - 300) - (a.y - 300) * (b.x - 300)) < 1e-6,
  );
  assert.equal(projectGuide(null, point), point);
  assert.equal(normalizeGuides(null).mode, "off");
  assert.equal(normalizeFill(null).reference, "active");
});
test("Gap closure contains bucket fill, expansion reaches line edges, and a separate reference remains untouched", () => {
  const w = 64,
    h = 64,
    reference = new Uint8ClampedArray(w * h * 4);
  const ink = (x, y) => reference.set([0, 0, 0, 255], (y * w + x) * 4);
  for (let x = 10; x <= 53; x++) {
    if (x !== 31 && x !== 32) ink(x, 10);
    ink(x, 53);
  }
  for (let y = 10; y <= 53; y++) {
    ink(10, y);
    ink(53, y);
  }
  const original = reference.slice(),
    output = new Uint8ClampedArray(reference.length);
  const config = {
    color: "#ff8000",
    opacity: 100,
    tolerance: 0,
    gap: 2,
    expand: 0,
  };
  assert.equal(
    professionalFill(output, reference, w, h, { x: 30, y: 30 }, config),
    true,
  );
  assert.deepEqual(
    [...output.slice((30 * w + 30) * 4, (30 * w + 30) * 4 + 4)],
    [255, 128, 0, 255],
  );
  assert.equal(output[(3 * w + 3) * 4 + 3], 0);
  assert.deepEqual(reference, original);
  const expanded = new Uint8ClampedArray(reference.length);
  professionalFill(
    expanded,
    reference,
    w,
    h,
    { x: 30, y: 30 },
    { ...config, expand: 2 },
  );
  assert.equal(expanded[(30 * w + 10) * 4 + 3], 255);
  assert.equal(
    professionalFill(expanded, reference, w, h, { x: -1, y: 10 }, config),
    false,
  );
});
test("Study time uses deadlines and history/reference storage is bounded", () => {
  assert.equal(remainingSeconds(10500, 1001), 10);
  assert.equal(remainingSeconds(10500, 11000), 0);
  assert.equal(normalizeStudy(null).duration, 60);
  assert.equal(normalizeStudy({ duration: 1, rounds: 200 }).duration, 10);
  assert.equal(normalizeStudy({ duration: 1, rounds: 200 }).rounds, 20);
  assert.equal(
    normalizeStudy({
      references: Array.from({ length: 30 }, () => ({
        name: "r",
        image: "data:image/png;base64,AA==",
      })),
    }).references.length,
    12,
  );
});

test(
  "v0.6 drawing guides, professional fill, and study workflow preserve actual artwork",
  { timeout: 180000 },
  async (t) => {
    const server = await serve({ port: 5187 }),
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
      }, String(value));
    async function tool(p, action) {
      await p.locator("#settings-button").click();
      await p.locator("#settings-" + action).click();
    }
    async function blank(p) {
      await p.locator("#new-document").click();
      await p.locator("#new-width").fill("600");
      await p.locator("#new-height").fill("400");
      await p.locator("#new-form button[type=submit]").click();
      await p.locator("#new-dialog").waitFor({ state: "hidden" });
      await p.locator("#choose-brush").click();
      await p.locator("#brush-dialog [data-brush=ink]").click();
      await p.locator("#brush-dialog-done").click();
      await range(p, "brush-size", 10);
      await range(p, "brush-opacity", 100);
      await p.locator("#hex-input").fill("#ff0000");
      await p.locator("#hex-input").dispatchEvent("change");
    }
    const pixels = (p, x, y) =>
      p
        .locator("#drawing-canvas")
        .evaluate(
          (c, [x, y]) => [...c.getContext("2d").getImageData(x, y, 1, 1).data],
          [x, y],
        );
    async function stroke(p, a, b, mirror = false) {
      const box = await p.locator("#drawing-canvas").boundingBox();
      const coords = ([x, y]) => ({
        x: box.x + box.width * (mirror ? 1 - x / 600 : x / 600),
        y: box.y + (box.height * y) / 400,
      });
      a = coords(a);
      b = coords(b);
      await p.mouse.move(a.x, a.y);
      await p.mouse.down();
      await p.mouse.move(b.x, b.y, { steps: 12 });
      await p.mouse.up();
    }
    async function exportProject(p) {
      const wait = p.waitForEvent("download");
      await p.locator("#save-project").click();
      return JSON.parse(await readFile(await (await wait).path(), "utf8"));
    }
    try {
      await t.test(
        "Ruler snaps pixels; guide settings survive reload while exports omit guides",
        async () => {
          const p = await open();
          await blank(p);
          await tool(p, "guides");
          await p.locator("#guide-mode").selectOption("ruler");
          assert.equal(await p.locator("#guide-overlay").isVisible(), true);
          await p.locator("#guide-snap").check();
          await p.locator("#guides-dialog .close-dialog").first().click();
          await stroke(p, [60, 80], [540, 280]);
          assert.deepEqual(await pixels(p, 300, 200), [255, 0, 0, 255]);
          assert.deepEqual(await pixels(p, 300, 80), [255, 255, 255, 255]);
          const project = await exportProject(p);
          assert.equal(project.version, 4);
          assert.equal("guides" in project, false);
          await p.waitForFunction(
            () =>
              document.getElementById("save-status").textContent ===
              "Saved on this device",
          );
          await p.reload();
          await p.waitForSelector('html[data-ready="true"]');
          await tool(p, "guides");
          assert.equal(await p.locator("#guide-mode").inputValue(), "ruler");
          assert.equal(await p.locator("#guide-snap").isChecked(), true);
          await p.close();
        },
      );
      await t.test(
        "Mirrored view maps input back to original pixels and grayscale does not change project colors",
        async () => {
          const p = await open();
          await blank(p);
          await tool(p, "guides");
          await p.locator("#view-mirror").check();
          await p.locator("#view-gray").check();
          await p.locator("#guides-dialog .close-dialog").first().click();
          await stroke(p, [450, 200], [500, 200], true);
          assert.deepEqual(await pixels(p, 475, 200), [255, 0, 0, 255]);
          assert.deepEqual(await pixels(p, 125, 200), [255, 255, 255, 255]);
          const project = await exportProject(p);
          const color = await p.evaluate(async (image) => {
            const im = new Image();
            im.src = image;
            await im.decode();
            const c = document.createElement("canvas");
            c.width = 600;
            c.height = 400;
            c.getContext("2d").drawImage(im, 0, 0);
            return [...c.getContext("2d").getImageData(475, 200, 1, 1).data];
          }, project.layers[0].image);
          assert.deepEqual(color, [255, 0, 0, 255]);
          await p.close();
        },
      );
      await t.test(
        "Visible-layer bucket closes gaps on an independent color layer, preserves line art, and undoes",
        async () => {
          const p = await open();
          await blank(p);
          const project = await exportProject(p);
          project.layers = await p.evaluate((base) => {
            const c = document.createElement("canvas");
            c.width = 600;
            c.height = 400;
            const ctx = c.getContext("2d");
            const colors = {
              ...base,
              id: "colors",
              name: "Colors",
              image: c.toDataURL(),
            };
            ctx.fillStyle = "#000";
            ctx.fillRect(100, 100, 400, 4);
            ctx.clearRect(298, 100, 4, 4);
            ctx.fillRect(100, 100, 4, 200);
            ctx.fillRect(496, 100, 4, 200);
            ctx.fillRect(100, 296, 400, 4);
            return [
              colors,
              { ...base, id: "ink", name: "Ink", image: c.toDataURL() },
            ];
          }, project.layers[0]);
          project.activeId = "colors";
          await p.locator("#project-file").setInputFiles({
            name: "Fill study.drawsketch",
            mimeType: "application/json",
            buffer: Buffer.from(JSON.stringify(project)),
          });
          await p.waitForFunction(
            () => document.querySelectorAll(".layer-item").length === 2,
          );
          await p
            .locator(".layer-item[data-layer-id=colors] .layer-name-wrap")
            .click();
          await tool(p, "fillProfessional");
          await p.locator("#fill-reference").selectOption("visible");
          await range(p, "fill-gap", 3);
          await range(p, "fill-expand", 2);
          await p.locator("#fill-dialog .close-dialog").first().click();
          await p.locator("[data-tool=fill]").click();
          const b = await p.locator("#drawing-canvas").boundingBox();
          await p.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
          await p.waitForFunction(
            () => !document.getElementById("undo").disabled,
          );
          assert.deepEqual(await pixels(p, 200, 200), [255, 0, 0, 255]);
          assert.deepEqual(await pixels(p, 50, 50), [255, 255, 255, 255]);
          assert.deepEqual(await pixels(p, 102, 200), [0, 0, 0, 255]);
          const result = await exportProject(p);
          assert.equal(result.layers[1].image, project.layers[1].image);
          await p.locator("#undo").click();
          await p.waitForFunction(
            () => !document.getElementById("redo").disabled,
          );
          assert.deepEqual(await pixels(p, 200, 200), [255, 255, 255, 255]);
          await p.reload();
          await p.waitForSelector('html[data-ready="true"]');
          await tool(p, "fillProfessional");
          assert.equal(
            await p.locator("#fill-reference").inputValue(),
            "visible",
          );
          assert.equal(await p.locator("#fill-gap").inputValue(), "3");
          await p.close();
        },
      );
      await t.test(
        "Timed study retains original pixels, reference aspect, completed history and advances rounds",
        async () => {
          const p = await open();
          await blank(p);
          const before = await p
            .locator("#drawing-canvas")
            .evaluate((c) => c.toDataURL());
          await tool(p, "study");
          const image = await p.evaluate(() => {
            const c = document.createElement("canvas");
            c.width = 800;
            c.height = 400;
            const x = c.getContext("2d");
            x.fillStyle = "blue";
            x.fillRect(0, 0, 800, 400);
            return c.toDataURL();
          });
          await p.locator("#study-files").setInputFiles({
            name: "Wide reference.png",
            mimeType: "image/png",
            buffer: Buffer.from(image.split(",")[1], "base64"),
          });
          await p.waitForFunction(() =>
            document
              .getElementById("study-reference-count")
              .textContent.startsWith("1/12"),
          );
          await p.locator("#study-exercise").selectOption("lines");
          await p.locator("#study-duration").fill("10");
          await p.locator("#study-rounds").fill("2");
          await p.locator("#study-start").click();
          assert.equal(await p.locator("#study-panel").isVisible(), true);
          await p.locator("#study-pause").click();
          assert.equal(
            await p.locator("#study-status").textContent(),
            "Paused",
          );
          await p.locator("#study-resume").click();
          await p.waitForFunction(
            () =>
              document.getElementById("study-status").textContent ===
              "Round complete",
            null,
            { timeout: 15000 },
          );
          assert.equal(
            await p.locator("#drawing-canvas").evaluate((c) => c.toDataURL()),
            before,
          );
          await p.locator("#study-next").click();
          assert.equal(
            await p.locator("#study-round").textContent(),
            "Round 2 of 2",
          );
          await p.locator("#study-manage").click();
          assert.equal(await p.locator(".study-history-entry").count(), 1);
          const stored = await p.evaluate(async () => {
            const { getWorkspace } = await import("/src/storage.js");
            return (await getWorkspace("drawsketch-study-v1")).study;
          });
          assert.equal(stored.sessions.length, 1);
          const aspect = await p.evaluate(async (src) => {
            const im = new Image();
            im.src = src;
            await im.decode();
            return im.width / im.height;
          }, stored.references[0].image);
          assert.equal(aspect, 2);
          await p.reload();
          await p.waitForSelector('html[data-ready="true"]');
          await tool(p, "study");
          assert.equal(await p.locator(".study-history-entry").count(), 1);
          await p.close();
        },
      );
      await t.test(
        "Phone, landscape and tablet tools remain reachable and every new catalog translates",
        async () => {
          for (const [width, height] of [
            [320, 740],
            [844, 390],
            [768, 1024],
            [1180, 820],
          ]) {
            const p = await open({ viewport: { width, height } });
            await tool(p, "guides");
            await p.locator("#guide-mode").selectOption("ellipse");
            await p.locator("#guides-dialog .close-dialog").first().click();
            await tool(p, "study");
            await p.locator("#study-start").click();
            if (width < 600) {
              assert.equal(
                await p
                  .locator("#study-panel")
                  .evaluate((el) => el.classList.contains("compact")),
                true,
              );
              await p.locator("#study-collapse").click();
              assert.equal(
                await p
                  .locator("#study-collapse")
                  .getAttribute("aria-expanded"),
                "true",
              );
            }
            assert.equal(await p.locator("#study-close").isVisible(), true);
            assert.ok(
              await p.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
              ),
            );
            await p.locator("#study-close").click();
            await p.locator("#settings-button").click();
            await p.locator("#language-select").selectOption("pt-BR");
            assert.equal(
              await p.locator("#settings-study").textContent(),
              "Estúdio de estudo",
            );
            await p.locator("#settings-dialog .close-dialog").first().click();
            await tool(p, "guides");
            assert.equal(
              await p
                .locator("#guide-mode option[value=ellipse]")
                .textContent(),
              "Guia elíptica",
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
