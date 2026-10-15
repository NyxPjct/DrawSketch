import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { launchBrowser, serve } from "../scripts/browser.mjs";

test(
  "Production PWA caches a complete app and still draws and saves offline",
  { timeout: 60_000 },
  async () => {
    const manifest = JSON.parse(
      await readFile(
        new URL("../dist/manifest.webmanifest", import.meta.url),
        "utf8",
      ),
    );
    assert.equal(manifest.display, "standalone");
    for (const icon of manifest.icons) {
      const data = await readFile(
        new URL(`../dist/${icon.src}`, import.meta.url),
      );
      assert.equal(data.subarray(1, 4).toString(), "PNG");
    }
    const server = await serve({ production: true, port: 4176 }),
      browser = await launchBrowser();
    try {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      });
      await page.goto(server.url);
      await page.waitForSelector('html[data-ready="true"]');
      await page.waitForFunction(
        () => navigator.serviceWorker.controller !== null,
      );
      const assets = await page.evaluate(async () => {
        const keys = await caches.keys();
        const cache = await caches.open(
          keys.find((key) => key.startsWith("drawsketch-")),
        );
        return (await cache.keys()).map(
          (request) => new URL(request.url).pathname,
        );
      });
      assert.ok(assets.includes("/index.html"));
      assert.ok(assets.some((url) => url.endsWith(".js")));
      assert.ok(assets.some((url) => url.endsWith(".css")));
      await page.context().setOffline(true);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector('html[data-ready="true"]');
      assert.equal(await page.evaluate(() => navigator.onLine), false);
      await page.locator('.brush-panel [data-brush="ink"]').click();
      const box = await page.locator("#drawing-canvas").boundingBox();
      await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.15);
      await page.mouse.down();
      await page.mouse.move(
        box.x + box.width * 0.3,
        box.y + box.height * 0.15,
        { steps: 12 },
      );
      await page.mouse.up();
      const hasInk = await page
        .locator("#drawing-canvas")
        .evaluate(
          (el) =>
            el
              .getContext("2d")
              .getImageData(
                Math.floor(el.width * 0.25),
                Math.floor(el.height * 0.15),
                1,
                1,
              ).data[0] < 240,
        );
      assert.ok(hasInk);
      await page.waitForFunction(
        () =>
          document.getElementById("save-status").textContent ===
          "Saved on this device",
      );
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector('html[data-ready="true"]');
      const savedInk = await page
        .locator("#drawing-canvas")
        .evaluate(
          (el) =>
            el
              .getContext("2d")
              .getImageData(
                Math.floor(el.width * 0.25),
                Math.floor(el.height * 0.15),
                1,
                1,
              ).data[0] < 240,
        );
      assert.ok(savedInk);
      // Load the fill worker for the first time while offline; it must be precached too.
      await page.locator("#new-document").click();
      await page.locator("#new-width").fill("600");
      await page.locator("#new-height").fill("400");
      await page.locator("#new-form button[type=submit]").click();
      await page.locator("#new-dialog").waitFor({ state: "hidden" });
      await page.locator("#hex-input").fill("#FF0000");
      await page.locator("#hex-input").dispatchEvent("change");
      await page.locator("[data-tool=fill]").click();
      await page.locator("#brush-opacity").evaluate((el) => {
        el.value = "100";
        el.dispatchEvent(new Event("input", { bubbles: true }));
      });
      const fillBox = await page.locator("#drawing-canvas").boundingBox();
      await page.mouse.click(
        fillBox.x + fillBox.width * 0.5,
        fillBox.y + fillBox.height * 0.7,
      );
      await page.waitForFunction(
        () =>
          document
            .getElementById("drawing-canvas")
            .getContext("2d")
            .getImageData(20, 20, 1, 1).data[1] === 0,
      );
      assert.deepEqual(
        await page
          .locator("#drawing-canvas")
          .evaluate((el) => [
            ...el.getContext("2d").getImageData(20, 20, 1, 1).data,
          ]),
        [255, 0, 0, 255],
      );
    } finally {
      await browser.close();
      server.stop();
    }
  },
);
