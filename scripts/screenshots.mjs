import { mkdir } from "node:fs/promises";
import { launchBrowser, serve } from "./browser.mjs";

const server = await serve({ production: true, port: 4175 });
const browser = await launchBrowser();
const output = new URL("../docs/screenshots/", import.meta.url);
await mkdir(output, { recursive: true });
try {
  for (const device of [
    { name: "desktop", width: 1600, height: 1050, touch: false },
    { name: "tablet", width: 1180, height: 820, touch: true },
    { name: "mobile", width: 390, height: 844, touch: true },
  ]) {
    // Separate contexts show the actual first launch on each device size.
    const context = await browser.newContext({
      viewport: { width: device.width, height: device.height },
      hasTouch: device.touch,
      isMobile: device.name === "mobile",
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.goto(server.url);
    await page.waitForSelector('html[data-ready="true"]');
    await page.waitForFunction(() =>
      document
        .getElementById("save-status")
        .textContent.includes("Saved on this device"),
    );
    await page.screenshot({
      path: new URL(`${device.name}.png`, output).pathname,
    });
    if (device.name === "mobile") {
      await page.locator("#toggle-properties").click();
      await page
        .locator("#properties-panel")
        .evaluate((element) =>
          Promise.all(
            element.getAnimations().map((animation) => animation.finished),
          ),
        );
      await page.screenshot({
        path: new URL("mobile-layers.png", output).pathname,
      });
    }
    await context.close();
    console.log(`Captured ${device.name}: ${device.width} × ${device.height}`);
  }
} finally {
  await browser.close();
  server.stop();
}
