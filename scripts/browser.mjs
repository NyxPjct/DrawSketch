import { spawn } from "node:child_process";
import { chromium as playwright } from "playwright";
import chromium from "@sparticuz/chromium";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function launchBrowser() {
  const cache =
    process.env.XDG_CACHE_HOME || join(tmpdir(), "drawsketch-cache");
  await mkdir(join(cache, "fontconfig"), { recursive: true });
  return playwright.launch(
    process.platform === "linux"
      ? {
          executablePath: await chromium.executablePath(),
          args: chromium.args.filter((arg) => arg !== "--single-process"),
          headless: true,
          env: { ...process.env, XDG_CACHE_HOME: cache },
        }
      : { headless: true },
  );
}
export async function serve({ production = false, port = 5175 } = {}) {
  const args = [
    "node_modules/vite/bin/vite.js",
    ...(production ? ["preview"] : []),
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ];
  const server = spawn(process.execPath, args, {
    cwd: new URL("../", import.meta.url),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  server.stdout.on("data", (data) => {
    output += data;
  });
  server.stderr.on("data", (data) => {
    output += data;
  });
  const url = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null) throw new Error(`Vite exited: ${output}`);
    try {
      if ((await fetch(url)).ok)
        return { url, stop: () => server.kill("SIGTERM") };
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  server.kill("SIGTERM");
  throw new Error(`Vite did not start: ${output}`);
}
