import { readFile, copyFile } from "node:fs/promises";
import { launchBrowser } from "./browser.mjs";
const svg = await readFile(
  new URL("../public/favicon.svg", import.meta.url),
  "utf8",
);
const browser = await launchBrowser();
try {
  for (const [density, size, foreground] of [
    ["mdpi", 48, 108],
    ["hdpi", 72, 162],
    ["xhdpi", 96, 216],
    ["xxhdpi", 144, 324],
    ["xxxhdpi", 192, 432],
  ]) {
    for (const [file, pixels] of [
      ["ic_launcher.png", size],
      ["ic_launcher_round.png", size],
      ["ic_launcher_foreground.png", foreground],
    ]) {
      const page = await browser.newPage({
        viewport: { width: pixels, height: pixels },
      });
      await page.setContent(
        `<style>body{margin:0;background:#ff8a24}svg{display:block;width:100vw;height:100vh}</style>${svg}`,
      );
      await page.screenshot({
        path: new URL(
          `../android/app/src/main/res/mipmap-${density}/${file}`,
          import.meta.url,
        ).pathname,
      });
      await page.close();
    }
  }
  const page = await browser.newPage({
    viewport: { width: 1024, height: 1024 },
  });
  await page.setContent(
    `<style>body{margin:0;background:#ff8a24}svg{display:block;width:100vw;height:100vh}</style>${svg}`,
  );
  await page.screenshot({
    path: new URL(
      "../ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
      import.meta.url,
    ).pathname,
  });
  await page.close();
  const splash = await browser.newPage({
    viewport: { width: 2732, height: 2732 },
  });
  await splash.setContent(
    `<style>body{margin:0;background:#0c0c0c;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font:70px Arial;gap:45px}svg{width:240px;height:240px}</style>${svg}<div>DrawSketch</div>`,
  );
  const target = new URL(
    "../ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png",
    import.meta.url,
  );
  await splash.screenshot({ path: target.pathname });
  for (const name of ["splash-2732x2732-1.png", "splash-2732x2732-2.png"])
    await copyFile(
      target,
      new URL(
        `../ios/App/App/Assets.xcassets/Splash.imageset/${name}`,
        import.meta.url,
      ),
    );
  await splash.close();
} finally {
  await browser.close();
}
console.log(
  "Android and iOS branding generated from the original DrawSketch mark.",
);
