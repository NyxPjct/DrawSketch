import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchBrowser } from "../scripts/browser.mjs";

const root = new URL("../", import.meta.url);
const url = "http://127.0.0.1:5174";
const white = [255, 255, 255, 255];

test(
  "Drawing editor: complete Chromium workflow",
  { timeout: 120_000 },
  async (t) => {
    const server = spawn(
      process.execPath,
      [
        "node_modules/vite/bin/vite.js",
        "--host",
        "127.0.0.1",
        "--port",
        "5174",
        "--strictPort",
      ],
      { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
    );
    let serverLog = "";
    server.stdout.on("data", (data) => {
      serverLog += data;
    });
    server.stderr.on("data", (data) => {
      serverLog += data;
    });
    let browser;
    const downloads = await mkdtemp(join(tmpdir(), "drawsketch-test-"));
    try {
      let ready = false;
      for (let attempt = 0; attempt < 60; attempt++) {
        if (server.exitCode !== null)
          throw new Error(`Vite exited: ${serverLog}`);
        try {
          ready = (await fetch(url)).ok;
        } catch {}
        if (ready) break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      assert.ok(ready, `Server did not start: ${serverLog}`);
      browser = await launchBrowser();
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
        acceptDownloads: true,
      });
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      const pixel = (x, y) =>
        page.evaluate(
          ([xx, yy]) =>
            Array.from(
              document
                .getElementById("drawing-canvas")
                .getContext("2d")
                .getImageData(xx, yy, 1, 1).data,
            ),
          [x, y],
        );
      const waitPixel = async (x, y, expected) => {
        await page.waitForFunction(
          ({ x, y, expected }) => {
            const actual = document
              .getElementById("drawing-canvas")
              .getContext("2d")
              .getImageData(x, y, 1, 1).data;
            return expected.every(
              (value, index) => Math.abs(value - actual[index]) < 3,
            );
          },
          { x, y, expected },
        );
      };
      const range = (id, value) =>
        page.locator(`#${id}`).evaluate((element, next) => {
          element.value = next;
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
        }, String(value));
      const color = async (value) => {
        await page.locator("#hex-input").fill(value);
        await page.locator("#hex-input").dispatchEvent("change");
      };
      const stroke = async (from, to) => {
        const box = await page.locator("#drawing-canvas").boundingBox();
        const dimensions = await page
          .locator("#drawing-canvas")
          .evaluate((element) => [element.width, element.height]);
        const convert = ([x, y]) => [
          box.x + (x * box.width) / dimensions[0],
          box.y + (y * box.height) / dimensions[1],
        ];
        await page.mouse.move(...convert(from));
        await page.mouse.down();
        await page.mouse.move(...convert(to), { steps: 12 });
        await page.mouse.up();
      };
      let project;
      await t.test(
        "starts with editable artwork and creates a canvas at the requested size",
        async () => {
          await page.goto(url);
          await page.waitForSelector('html[data-ready="true"]');
          assert.equal(await page.locator(".layer-item").count(), 2);
          const imageHasArt = await page
            .locator("#drawing-canvas")
            .evaluate((element) => {
              const pixels = element
                .getContext("2d")
                .getImageData(0, 0, element.width, element.height).data;
              let colored = 0;
              for (let i = 0; i < pixels.length; i += 4)
                if (pixels[i] < 245) colored++;
              return colored > 5000;
            });
          assert.ok(imageHasArt);
          await page.locator("#new-document").click();
          await page.locator("#new-name").fill("Drawing test");
          await page.locator("#new-width").fill("512");
          await page.locator("#new-height").fill("384");
          await page.locator('#new-form button[type="submit"]').click();
          assert.equal(
            await page.locator("#drawing-canvas").getAttribute("width"),
            "512",
          );
          assert.equal(await page.locator(".layer-item").count(), 1);
          assert.deepEqual(await pixel(256, 192), white);
        },
      );

      await t.test(
        "brush edits pixels; undo and redo restore the artwork",
        async () => {
          await page.locator('.brush-panel [data-brush="ink"]').click();
          await range("brush-size", 18);
          await color("#D62F45");
          await stroke([180, 130], [330, 130]);
          await waitPixel(250, 130, [214, 47, 69, 255]);
          await page.locator("#undo").click();
          await waitPixel(250, 130, white);
          await page.locator("#redo").click();
          await waitPixel(250, 130, [214, 47, 69, 255]);
        },
      );

      await t.test("eraser removes pixels and can be undone", async () => {
        await page.locator('[data-tool="eraser"]').click();
        await range("brush-size", 30);
        await stroke([250, 110], [250, 150]);
        await waitPixel(250, 130, white);
        await page.locator("#undo").click();
        await waitPixel(250, 130, [214, 47, 69, 255]);
      });

      await t.test(
        "layers preserve independent artwork, visibility, opacity, and order",
        async () => {
          await page.locator("#add-layer").click();
          await page.locator('[data-tool="brush"]').click();
          await range("brush-size", 18);
          await color("#285B4E");
          await stroke([250, 100], [250, 160]);
          await waitPixel(250, 130, [40, 91, 78, 255]);
          await page.locator(".layer-item.selected .layer-visibility").click();
          await waitPixel(250, 130, [214, 47, 69, 255]);
          await page.locator(".layer-item.selected .layer-visibility").click();
          await range("layer-opacity", 0);
          await waitPixel(250, 130, [214, 47, 69, 255]);
          await range("layer-opacity", 100);
          await page.locator("#layer-down").click();
          await waitPixel(250, 130, [214, 47, 69, 255]);
          await page.locator("#layer-up").click();
          await waitPixel(250, 130, [40, 91, 78, 255]);
          await page.locator("#duplicate-layer").click();
          assert.equal(await page.locator(".layer-item").count(), 3);
          await page.locator("#delete-layer").click();
          assert.equal(await page.locator(".layer-item").count(), 2);
        },
      );

      await t.test(
        "shapes, flood fill, and eyedropper work on the canvas",
        async () => {
          await page.locator("#add-layer").click();
          await color("#26362E");
          await range("brush-size", 5);
          await page.locator('[data-tool="rectangle"]').click();
          await stroke([150, 220], [310, 320]);
          await color("#BA795D");
          await page.locator('[data-tool="fill"]').click();
          await stroke([220, 260], [220, 260]);
          await waitPixel(220, 260, [186, 121, 93, 255]);
          assert.deepEqual(await pixel(330, 260), white);
          await page.locator('[data-tool="eyedropper"]').click();
          await stroke([220, 260], [220, 260]);
          assert.equal(
            await page.locator("#hex-input").inputValue(),
            "#BA795D",
          );
          assert.equal(
            await page
              .locator('[data-tool="brush"]')
              .getAttribute("aria-pressed"),
            "true",
          );
          await page.locator('[data-tool="line"]').click();
          await stroke([350, 200], [410, 260]);
          assert.notDeepEqual(await pixel(380, 230), white);
          await page.locator('[data-tool="ellipse"]').click();
          await stroke([350, 280], [430, 340]);
          assert.notDeepEqual(await pixel(390, 280), white);
        },
      );

      await t.test(
        "graphite, marker, and watercolor produce distinct strokes",
        async () => {
          const values = [];
          for (const [index, brush] of [
            "pencil",
            "marker",
            "watercolor",
          ].entries()) {
            await page.locator(`.brush-panel [data-brush="${brush}"]`).click();
            await color("#285B4E");
            await range("brush-size", 14);
            const y = 40 + index * 25;
            await stroke([150, y], [230, y]);
            const sampled = await pixel(190, y);
            assert.notDeepEqual(sampled, white);
            values.push(sampled.join(","));
          }
          assert.equal(new Set(values).size, 3);
        },
      );

      await t.test(
        "exports a valid PNG and editable project with every layer",
        async () => {
          const pngEvent = page.waitForEvent("download");
          await page.locator("#export-image").click();
          const png = await pngEvent;
          const path = join(downloads, "drawing.png");
          await png.saveAs(path);
          const bytes = await readFile(path);
          assert.equal(bytes.subarray(1, 4).toString(), "PNG");
          assert.equal(bytes.readUInt32BE(16), 512);
          assert.equal(bytes.readUInt32BE(20), 384);
          const projectEvent = page.waitForEvent("download");
          await page.locator("#save-project").click();
          const projectFile = await projectEvent;
          const projectPath = join(downloads, "drawing.drawsketch");
          await projectFile.saveAs(projectPath);
          project = JSON.parse(await readFile(projectPath, "utf8"));
          assert.equal(project.layers.length, 3);
          assert.equal(project.width, 512);
          assert.ok(
            project.layers.every((layer) =>
              layer.image.startsWith("data:image/png;base64,"),
            ),
          );
        },
      );

      await t.test(
        "recovers local saves and reopens projects without losing pixels",
        async () => {
          await page.waitForFunction(() =>
            document
              .getElementById("save-status")
              .textContent.includes("Saved on this device"),
          );
          await page.reload();
          await page.waitForSelector('html[data-ready="true"]');
          await waitPixel(250, 130, [40, 91, 78, 255]);
          await waitPixel(220, 260, [186, 121, 93, 255]);
          assert.equal(
            await page.locator("#document-name").inputValue(),
            "Drawing test",
          );
          await page.locator("#project-file").setInputFiles({
            name: "roundtrip.drawsketch",
            mimeType: "application/json",
            buffer: Buffer.from(JSON.stringify(project)),
          });
          await page.waitForFunction(() =>
            document
              .getElementById("toast")
              .textContent.includes("Project opened"),
          );
          await waitPixel(220, 260, [186, 121, 93, 255]);
        },
      );

      await t.test(
        "rejects invalid projects and imports images as new layers",
        async () => {
          await page.locator("#project-file").setInputFiles({
            name: "bad.drawsketch",
            mimeType: "application/json",
            buffer: Buffer.from('{"format":"other"}'),
          });
          await page.waitForFunction(() =>
            document
              .getElementById("toast")
              .textContent.includes("not a valid DrawSketch"),
          );
          await waitPixel(220, 260, [186, 121, 93, 255]);
          const png = await readFile(join(downloads, "drawing.png"));
          await page.locator("#image-file").setInputFiles({
            name: "imported.png",
            mimeType: "image/png",
            buffer: png,
          });
          await page.waitForFunction(
            () => document.querySelectorAll(".layer-item").length === 4,
          );
          await waitPixel(220, 260, [186, 121, 93, 255]);
        },
      );

      await t.test(
        "zoom, grid, and brush controls remain accessible on a phone",
        async () => {
          await page.locator("#zoom-in").click();
          assert.notEqual(
            await page.locator("#zoom-value").textContent(),
            "100%",
          );
          await page.locator("#toggle-grid").click();
          assert.equal(await page.locator("#paper-grid").isVisible(), true);
          await page.setViewportSize({ width: 390, height: 844 });
          await page.locator("#choose-brush").click();
          await page.locator('#brush-dialog [data-brush="marker"]').click();
          await range("mobile-brush-size", 22);
          await page.locator("#brush-dialog-done").click();
          assert.equal(
            await page.locator("#active-tool-name").textContent(),
            "Bold marker",
          );
          assert.equal(await page.locator("#brush-size").inputValue(), "22");
          assert.equal(
            await page.locator("#properties-panel").isVisible(),
            false,
          );
          await page.locator("#toggle-properties").click();
          await page.locator("#properties-panel").waitFor({ state: "visible" });
          assert.equal(
            await page.locator("#properties-panel").isVisible(),
            true,
          );
          await page.locator('[aria-label="Use color #285B4E"]').click();
          await page.locator("#close-properties").click();
          await page.locator("#properties-panel").waitFor({ state: "hidden" });
          await stroke([180, 185], [260, 185]);
          assert.notDeepEqual(await pixel(220, 185), white);
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          );
          assert.equal(await page.locator("#export-image").isVisible(), true);
        },
      );

      await t.test("no JavaScript errors during the workflow", () => {
        assert.deepEqual(pageErrors, []);
      });
    } finally {
      await browser?.close();
      server.kill("SIGTERM");
      await rm(downloads, { recursive: true, force: true });
    }
  },
);
