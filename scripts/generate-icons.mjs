import { readFile, mkdir } from "node:fs/promises";
import { launchBrowser } from "./browser.mjs";

const svg = await readFile(
  new URL("../public/favicon.svg", import.meta.url),
  "utf8",
);
await mkdir(new URL("../public/icons/", import.meta.url), { recursive: true });
const browser = await launchBrowser();
try {
  for (const [file, size] of [
    ["icon-192.png", 192],
    ["icon-512.png", 512],
    ["apple-touch-icon.png", 180],
  ]) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
    });
    await page.setContent(
      `<style>body{margin:0;background:#ff8a24}svg{display:block;width:100vw;height:100vh}</style>${svg}`,
    );
    await page.screenshot({
      path: new URL(`../public/icons/${file}`, import.meta.url).pathname,
    });
    await page.close();
  }
} finally {
  await browser.close();
}
console.log("Generated install icons from the DrawSketch vector mark.");
