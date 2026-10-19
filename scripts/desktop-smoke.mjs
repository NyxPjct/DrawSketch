import assert from "node:assert/strict";
import { _electron } from "playwright";
import { mkdtemp, mkdir, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const profile = await mkdtemp(join(tmpdir(), "drawsketch-desktop-"));
const fontCache = join(profile, "cache");
await mkdir(fontCache, { recursive: true });
const root = new URL("../", import.meta.url).pathname;
const diagnostics = [];
let application;
try {
  application = await _electron.launch({
    args: [
      "--no-sandbox",
      "--ozone-platform=headless",
      ...(process.env.DRAWSKETCH_DESKTOP_EXECUTABLE ? [] : [root]),
    ],
    ...(process.env.DRAWSKETCH_DESKTOP_EXECUTABLE
      ? { executablePath: process.env.DRAWSKETCH_DESKTOP_EXECUTABLE }
      : {}),
    env: {
      ...process.env,
      DRAWSKETCH_DATA_DIR: profile,
      XDG_CACHE_HOME: fontCache,
    },
  });
  const page = await application.firstWindow();
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") diagnostics.push(msg.text());
  });
  page.on("requestfailed", (request) =>
    diagnostics.push(request.url() + " " + request.failure()?.errorText),
  );
  await page.waitForSelector('html[data-ready="true"]');
  assert.equal(new URL(page.url()).protocol, "studio:");
  assert.equal(await page.evaluate(() => typeof require), "undefined");
  assert.equal(await page.evaluate(() => !!window.drawsketchDesktop), true);
  const updateStatus = await page.evaluate(() =>
    window.drawsketchDesktop.updates("status"),
  );
  assert.equal(updateStatus.state, "unavailable");
  assert.equal(
    updateStatus.version,
    JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    ).version,
  );
  await assert.rejects(
    page.evaluate(() => window.drawsketchDesktop.updates("unsupported-action")),
    /Invalid update action/,
  );
  await page.locator("#new-document").click();
  await page.locator("#new-name").fill("Desktop smoke");
  await page.locator("#new-width").fill("600");
  await page.locator("#new-height").fill("400");
  await page.locator("#new-form button[type=submit]").click();
  await page.locator("#new-dialog").waitFor({ state: "hidden" });
  await page.locator("#choose-brush").click();
  await page.locator("#brush-dialog [data-brush=ink]").click();
  await page.locator("#brush-dialog-done").click();
  const box = await page.locator("#drawing-canvas").boundingBox();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.4, {
    steps: 12,
  });
  await page.mouse.up();
  assert.ok(
    await page
      .locator("#drawing-canvas")
      .evaluate(
        (el) => el.getContext("2d").getImageData(270, 160, 1, 1).data[0] < 240,
      ),
  );
  await page.waitForFunction(
    () =>
      document.getElementById("save-status").textContent ===
      "Saved on this device",
  );
  await page.reload();
  await page.waitForSelector('html[data-ready="true"]');
  assert.equal(
    await page.locator("#document-name").inputValue(),
    "Desktop smoke",
  );
  await page.locator("#hex-input").fill("#FF0000");
  await page.locator("#hex-input").dispatchEvent("change");
  await page.locator("[data-tool=fill]").click();
  const canvasBox = await page.locator("#drawing-canvas").boundingBox();
  await page.locator("#brush-opacity").evaluate((el) => {
    el.value = "100";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.mouse.click(
    canvasBox.x + canvasBox.width * 0.5,
    canvasBox.y + canvasBox.height * 0.7,
  );
  await page.waitForFunction(
    () =>
      document
        .getElementById("drawing-canvas")
        .getContext("2d")
        .getImageData(10, 10, 1, 1).data[1] === 0,
    null,
    { timeout: 30000 },
  );
  assert.deepEqual(errors, []);
  console.log(
    "Electron verified: isolated renderer, local app protocol, drawing pixels, persistent recovery, worker fill, restricted update API.",
  );
} catch (error) {
  if (application) {
    const pages = application.windows();
    for (const page of pages)
      console.error(
        await page.evaluate(() => ({
          toast: document.getElementById("toast")?.textContent,
          status: document.getElementById("save-status")?.textContent,
          tool: document.querySelector("[data-tool][aria-pressed=true]")
            ?.dataset.tool,
          pixels: [
            ...document
              .getElementById("drawing-canvas")
              .getContext("2d")
              .getImageData(10, 10, 1, 1).data,
          ],
          color: document.getElementById("hex-input").value,
          dimensions: [
            document.getElementById("drawing-canvas").width,
            document.getElementById("drawing-canvas").height,
          ],
          undoDisabled: document.getElementById("undo").disabled,
        })),
      );
  }
  console.error(
    diagnostics,
    "workers:",
    application
      ?.windows()[0]
      ?.workers()
      .map((worker) => worker.url()),
  );
  throw error;
} finally {
  await application?.close();
  await rm(profile, { recursive: true, force: true });
}
