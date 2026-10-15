import assert from "node:assert/strict";
import { test } from "node:test";
import { messages } from "../src/i18n.js";
import { launchBrowser, serve } from "../scripts/browser.mjs";

test("Every supported language has a complete, matching translation catalog", () => {
  const keys = Object.keys(messages.en).sort();
  for (const [locale, catalog] of Object.entries(messages)) {
    assert.deepEqual(Object.keys(catalog).sort(), keys, locale);
    for (const key of keys) {
      assert.ok(
        typeof catalog[key] === "string" && catalog[key].length,
        `${locale}.${key}`,
      );
      assert.deepEqual(
        catalog[key].match(/\{\w+\}/g) || [],
        messages.en[key].match(/\{\w+\}/g) || [],
        `${locale}.${key} placeholders`,
      );
    }
  }
});

test(
  "Studio settings, professional tools, touch, and sketchbook",
  { timeout: 150_000 },
  async (t) => {
    const server = await serve({ port: 5176 });
    const browser = await launchBrowser();
    const errors = [];
    const white = [255, 255, 255, 255];
    async function pageFor(options = {}) {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
        ...options,
      });
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(server.url);
      await page.waitForSelector('html[data-ready="true"]');
      return page;
    }
    const range = (page, id, value) =>
      page.locator(`#${id}`).evaluate((el, value) => {
        el.value = value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }, String(value));
    const color = async (page, value) => {
      await page.locator("#hex-input").fill(value);
      await page.locator("#hex-input").dispatchEvent("change");
    };
    const pixel = (page, x, y) =>
      page
        .locator("#drawing-canvas")
        .evaluate(
          (el, [x, y]) =>
            Array.from(el.getContext("2d").getImageData(x, y, 1, 1).data),
          [x, y],
        );
    async function coords(page, x, y) {
      const box = await page.locator("#drawing-canvas").boundingBox();
      const dimensions = await page
        .locator("#drawing-canvas")
        .evaluate((el) => [el.width, el.height]);
      return {
        x: box.x + (x * box.width) / dimensions[0],
        y: box.y + (y * box.height) / dimensions[1],
      };
    }
    async function stroke(page, from, to) {
      const a = await coords(page, ...from),
        b = await coords(page, ...to);
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(b.x, b.y, { steps: 12 });
      await page.mouse.up();
    }
    async function blank(page, name = "Canvas A", width = 600, height = 400) {
      await page.locator("#new-document").click();
      await page.locator("#new-name").fill(name);
      await page.locator("#new-width").fill(String(width));
      await page.locator("#new-height").fill(String(height));
      await page.locator('#new-form button[type="submit"]').click();
      await page.locator("#new-dialog").waitFor({ state: "hidden" });
      await page.locator("#choose-brush").click();
      await page.locator('#brush-dialog [data-brush="ink"]').click();
      await page.locator("#brush-dialog-done").click();
      await range(page, "brush-size", 16);
    }
    try {
      await t.test(
        "English is the default; changing language translates all static text, tooltips, ARIA, dynamic names, and toasts",
        async () => {
          const page = await pageFor();
          assert.equal(await page.locator("html").getAttribute("lang"), "en");
          for (const locale of ["pt-BR", "es", "en"]) {
            await page.locator("#settings-button").click();
            await page.locator("#language-select").selectOption(locale);
            const mismatches = await page.evaluate((catalog) => {
              const issues = [];
              document.querySelectorAll("[data-i18n]").forEach((el) => {
                if (el.textContent !== catalog[el.dataset.i18n])
                  issues.push(el.dataset.i18n);
              });
              for (const attr of ["title", "aria-label", "placeholder"])
                document
                  .querySelectorAll(`[data-i18n-${attr}]`)
                  .forEach((el) => {
                    const key = el.getAttribute(`data-i18n-${attr}`);
                    if (el.getAttribute(attr) !== catalog[key])
                      issues.push(`${attr}:${key}`);
                  });
              return issues;
            }, messages[locale]);
            assert.deepEqual(mismatches, []);
            assert.equal(
              await page.locator("html").getAttribute("lang"),
              locale,
            );
            assert.equal(
              await page.locator("#document-name").inputValue(),
              messages[locale].demoTitle,
            );
            assert.ok(
              (
                await page
                  .locator(".layer-item.selected .layer-name")
                  .textContent()
              ).includes(messages[locale].demoLines),
            );
            await page
              .locator("#settings-dialog .close-dialog")
              .first()
              .click();
            await color(page, "#nope");
            assert.equal(
              await page.locator("#toast").textContent(),
              messages[locale].errorHex,
            );
          }
          await page.locator("#settings-button").click();
          await page.locator("#language-select").selectOption("pt-BR");
          await page.locator("#theme-select").selectOption("light");
          await page.locator("#settings-dialog .close-dialog").first().click();
          await page.reload();
          await page.waitForSelector('html[data-ready="true"]');
          assert.equal(
            await page.locator("html").getAttribute("lang"),
            "pt-BR",
          );
          assert.equal(
            await page.locator("html").getAttribute("data-theme"),
            "light",
          );
          await page.close();
        },
      );

      await t.test(
        "layer locks, names, blend modes, merging, and transparent PNG preserve actual pixels",
        async () => {
          const page = await pageFor();
          await blank(page);
          await color(page, "#FF0000");
          await stroke(page, [180, 140], [320, 140]);
          await page.locator("#add-layer").click();
          await color(page, "#0000FF");
          await stroke(page, [250, 110], [250, 180]);
          assert.deepEqual(await pixel(page, 250, 140), [0, 0, 255, 255]);
          await page.locator("#blend-mode").selectOption("multiply");
          assert.deepEqual(await pixel(page, 250, 140), [0, 0, 0, 255]);
          await page.locator("#blend-mode").selectOption("screen");
          assert.deepEqual(await pixel(page, 250, 140), [255, 0, 255, 255]);
          await page.locator("#blend-mode").selectOption("overlay");
          assert.deepEqual(await pixel(page, 250, 140), [255, 0, 0, 255]);
          await page.locator("#blend-mode").selectOption("source-over");
          await page.locator("#layer-lock").click();
          await stroke(page, [180, 240], [300, 240]);
          assert.deepEqual(await pixel(page, 240, 240), white);
          assert.equal(
            await page.locator("#toast").textContent(),
            messages.en.errorLayer,
          );
          await page.locator("#layer-lock").click();
          await page.locator("#rename-layer").click();
          await page.locator("#layer-name-input").fill("My highlights");
          await page.locator('#rename-form button[type="submit"]').click();
          assert.equal(
            await page
              .locator(".layer-item.selected .layer-name")
              .textContent(),
            "My highlights",
          );
          await page.locator("#merge-layer").click();
          assert.equal(await page.locator(".layer-item").count(), 1);
          assert.deepEqual(await pixel(page, 250, 140), [0, 0, 255, 255]);
          assert.deepEqual(await pixel(page, 190, 140), [255, 0, 0, 255]);
          await page.locator("#canvas-background").selectOption("transparent");
          assert.deepEqual(await pixel(page, 20, 20), [0, 0, 0, 0]);
          const downloadEvent = page.waitForEvent("download");
          await page.locator("#export-image").click();
          const file = await downloadEvent;
          const stream = await file.createReadStream();
          const chunks = [];
          for await (const chunk of stream) chunks.push(chunk);
          const png = Buffer.concat(chunks).toString("base64");
          const alpha = await page.evaluate(async (data) => {
            const image = new Image();
            image.src = `data:image/png;base64,${data}`;
            await image.decode();
            const canvas = document.createElement("canvas");
            canvas.width = image.width;
            canvas.height = image.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(image, 0, 0);
            return ctx.getImageData(20, 20, 1, 1).data[3];
          }, png);
          assert.equal(alpha, 0);
          await page.close();
        },
      );

      await t.test(
        "symmetry, filled shapes, and every new brush produce real strokes",
        async () => {
          const page = await pageFor();
          await blank(page);
          await color(page, "#D62F45");
          await page.locator("#symmetry").selectOption("vertical");
          await stroke(page, [130, 100], [170, 100]);
          assert.deepEqual(await pixel(page, 150, 100), [214, 47, 69, 255]);
          assert.deepEqual(await pixel(page, 450, 100), [214, 47, 69, 255]);
          await page.locator("#symmetry").selectOption("off");
          await page.locator('[data-tool="rectangle"]').click();
          await page.locator("#shape-fill").click();
          await stroke(page, [200, 200], [280, 280]);
          assert.deepEqual(await pixel(page, 240, 240), [214, 47, 69, 255]);
          for (const [index, brush] of [
            "airbrush",
            "charcoal",
            "oil",
            "pixel",
          ].entries()) {
            await page.locator(`.brush-panel [data-brush="${brush}"]`).click();
            await range(page, "brush-size", 18);
            await color(page, "#285B4E");
            const y = 40 + index * 60;
            await stroke(page, [350, y], [400, y]);
            const hasInk = await page
              .locator("#drawing-canvas")
              .evaluate((el, y) => {
                const p = el
                  .getContext("2d")
                  .getImageData(365, y - 7, 20, 14).data;
                return Array.from(p).some((v, i) => i % 4 !== 3 && v < 245);
              }, y);
            assert.ok(hasInk, brush);
          }
          await range(page, "stabilization", 65);
          await stroke(page, [450, 300], [500, 330]);
          assert.notDeepEqual(await pixel(page, 500, 330), white);
          await page.close();
        },
      );

      await t.test(
        "stylus pressure changes stroke width; turning pressure off makes widths consistent",
        async () => {
          const page = await pageFor();
          await blank(page);
          await color(page, "#285B4E");
          await range(page, "brush-size", 24);
          const cdp = await page.context().newCDPSession(page);
          async function pen(y, force) {
            const a = await coords(page, 180, y),
              b = await coords(page, 300, y);
            await cdp.send("Input.dispatchMouseEvent", {
              type: "mousePressed",
              ...a,
              button: "left",
              buttons: 1,
              clickCount: 1,
              pointerType: "pen",
              force,
            });
            await cdp.send("Input.dispatchMouseEvent", {
              type: "mouseMoved",
              ...b,
              button: "left",
              buttons: 1,
              pointerType: "pen",
              force,
            });
            await cdp.send("Input.dispatchMouseEvent", {
              type: "mouseReleased",
              ...b,
              button: "left",
              buttons: 0,
              clickCount: 1,
              pointerType: "pen",
              force: 0,
            });
          }
          const count = (y) =>
            page.locator("#drawing-canvas").evaluate((el, y) => {
              const p = el
                .getContext("2d")
                .getImageData(240, y - 25, 1, 50).data;
              let n = 0;
              for (let i = 0; i < p.length; i += 4) if (p[i] < 200) n++;
              return n;
            }, y);
          await pen(100, 0.1);
          await pen(170, 0.9);
          assert.ok((await count(170)) > (await count(100)));
          await page.locator("#settings-button").click();
          await page.locator("#pressure-setting").uncheck();
          await page.locator("#settings-dialog .close-dialog").first().click();
          await pen(240, 0.1);
          await pen(310, 0.9);
          assert.equal(await count(240), await count(310));
          await page.close();
        },
      );

      await t.test(
        "two-finger pan, pinch, and rotation cancel accidental ink; one-finger navigation respects settings",
        async () => {
          const page = await pageFor({
            viewport: { width: 390, height: 844 },
            hasTouch: true,
            isMobile: true,
          });
          await blank(page, "Touch canvas");
          const before = await page
            .locator("#drawing-canvas")
            .evaluate((el) => el.toDataURL());
          const zoom = await page.locator("#zoom-value").textContent();
          const a = await coords(page, 180, 160),
            b = await coords(page, 400, 160),
            cdp = await page.context().newCDPSession(page);
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [{ ...a, id: 1 }],
          });
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [
              { ...a, id: 1 },
              { ...b, id: 2 },
            ],
          });
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [
              { x: a.x - 12, y: a.y - 10, id: 1 },
              { x: b.x + 15, y: b.y + 12, id: 2 },
            ],
          });
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
          });
          assert.notEqual(
            await page.locator("#zoom-value").textContent(),
            zoom,
          );
          assert.notEqual(
            await page.locator("#rotation-value").textContent(),
            "0°",
          );
          assert.equal(
            await page
              .locator("#drawing-canvas")
              .evaluate((el) => el.toDataURL()),
            before,
          );
          await page.locator("#settings-button").click();
          await page.locator("#finger-setting").uncheck();
          await page.locator("#settings-dialog .close-dialog").first().click();
          const transform = await page
            .locator("#canvas-shell")
            .getAttribute("style");
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [{ x: 220, y: 450, id: 3 }],
          });
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x: 245, y: 480, id: 3 }],
          });
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
          });
          assert.notEqual(
            await page.locator("#canvas-shell").getAttribute("style"),
            transform,
          );
          assert.equal(
            await page
              .locator("#drawing-canvas")
              .evaluate((el) => el.toDataURL()),
            before,
          );
          await page.locator("#settings-button").click();
          await page.locator("#finger-setting").check();
          await page.locator("#settings-dialog .close-dialog").first().click();
          await page.locator("#fit-canvas").click();
          const p = await coords(page, 250, 200),
            q = await coords(page, 350, 200);
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [{ ...p, id: 4 }],
          });
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ ...q, id: 4 }],
          });
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
          });
          assert.notDeepEqual(await pixel(page, 300, 200), white);
          await page.close();
        },
      );

      await t.test(
        "the sketchbook keeps separate canvases and restores their pixels after reloading",
        async () => {
          const page = await pageFor();
          await blank(page, "First idea");
          await color(page, "#D62F45");
          await stroke(page, [180, 140], [320, 140]);
          await blank(page, "Second idea");
          await page.locator("#gallery-button").click();
          await page.locator("#gallery-dialog").waitFor({ state: "visible" });
          assert.ok((await page.locator(".gallery-card").count()) >= 3);
          await page
            .getByRole("button", { name: "Open First idea", exact: true })
            .click();
          await page.locator("#gallery-dialog").waitFor({ state: "hidden" });
          assert.deepEqual(await pixel(page, 250, 140), [214, 47, 69, 255]);
          await page.waitForFunction(
            () =>
              document.getElementById("save-status").textContent ===
              "Saved on this device",
          );
          await page.reload();
          await page.waitForSelector('html[data-ready="true"]');
          assert.equal(
            await page.locator("#document-name").inputValue(),
            "First idea",
          );
          assert.deepEqual(await pixel(page, 250, 140), [214, 47, 69, 255]);
          await page.close();
        },
      );

      await t.test(
        "desktop, phone, landscape phone, and both tablet orientations fit without page overflow",
        async () => {
          const page = await pageFor();
          for (const [width, height] of [
            [320, 740],
            [390, 844],
            [768, 1024],
            [844, 390],
            [1180, 820],
            [1600, 1050],
          ]) {
            await page.setViewportSize({ width, height });
            await page.locator("#fit-canvas").click();
            assert.ok(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
              ),
              `${width} × ${height}`,
            );
            assert.equal(
              await page.locator("#settings-button").isVisible(),
              true,
            );
            const overlaps = await page.evaluate(() => {
              const a = document
                  .querySelector(".layers-section")
                  .getBoundingClientRect(),
                b = document
                  .querySelector(".local-note")
                  .getBoundingClientRect();
              return a.bottom > b.top + 1;
            });
            assert.equal(overlaps, false);
          }
          await page.close();
        },
      );
      await t.test(
        "no JavaScript runtime errors across the additional workflows",
        () => assert.deepEqual(errors, []),
      );
    } finally {
      await browser.close();
      server.stop();
    }
  },
);
