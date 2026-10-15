import { defineConfig } from "vite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export default defineConfig({
  plugins: [
    {
      name: "drawsketch-offline-shell",
      enforce: "post",
      generateBundle(_options, bundle) {
        const generated = Object.keys(bundle).filter(
          (file) => !file.endsWith(".map"),
        );
        const files = [
          ...generated,
          "manifest.webmanifest",
          "favicon.svg",
          "icons/icon-192.png",
          "icons/icon-512.png",
          "icons/apple-touch-icon.png",
        ];
        const hash = createHash("sha256");
        for (const [file, asset] of Object.entries(bundle))
          hash
            .update(file)
            .update(asset.type === "chunk" ? asset.code : asset.source);
        for (const file of files.filter((file) => !generated.includes(file)))
          hash.update(
            readFileSync(new URL(`./public/${file}`, import.meta.url)),
          );
        const version = hash.digest("hex").slice(0, 12);
        this.emitFile({
          type: "asset",
          fileName: "sw.js",
          source: `
const CACHE = 'drawsketch-${version}';
const PREFIX = 'drawsketch-';
const FILES = ${JSON.stringify(files)};
const url = path => new URL(path, self.registration.scope).href;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES.map(url))));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (event.request.mode === 'navigate') {
      // A version's HTML and hashed assets are kept together to avoid a partial update.
      return await cache.match(url('index.html')) || fetch(event.request);
    }
    // Only immutable, same-origin application files are precached. Vite can
    // attach Vary: Origin; module requests and precache requests differ there.
    return await cache.match(event.request, { ignoreVary: true }) || fetch(event.request);
  })());
});`,
        });
      },
    },
  ],
});
