# Developing DrawSketch

## Environment

Use Node.js 24 or Node.js 22.17 and later in the 22.x release line and npm. The cloud environment is validated with Node.js 24.19.0 and npm 11.9.0. It needs no databases, external services, API keys, or private credentials.

Each cloud task is already isolated. Reuse `/workspace/DrawSketch`; do not create a Git worktree unless the user explicitly requests one. Preserve existing changes.

```sh
cd /workspace/DrawSketch
npm ci --cache /workspace/.cache/npm --no-audit --no-fund
npm run dev
```

The npm cache override keeps writes in the workspace. Do not disable TLS or package integrity checks.

## Structure

| File               | Responsibility                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------- |
| `src/main.js`      | Document state, UI, history, autosave, gestures, preferences, and file operations             |
| `src/engine.js`    | Brush engines, texture, color pickup, tilt, symmetry, constrained shapes, and resource limits |
| `src/i18n.js`      | English, Brazilian Portuguese, and Spanish catalogs and DOM translations                      |
| `src/storage.js`   | IndexedDB document library                                                                    |
| `src/studio.js`    | Selections UI, advanced layers, custom brushes, checkpoints, and backups                      |
| `src/canvas.js`    | Mask/clipping/group compositing, dirty revisions, cached PNG snapshots                        |
| `src/selection.js` | Rectangle/lasso clipping and non-destructive floating transforms                              |
| `src/fill*.js`     | Scanline fill and transferable worker requests                                                |
| `src/history.js`   | Shared-snapshot history memory budget                                                         |
| `src/native.js`    | Native mobile filesystem and share sheet export                                               |
| `electron/`        | Isolated desktop renderer and secure local application protocol                               |
| `android/`, `ios/` | Capacitor platform source projects                                                            |
| `src/demo.js`      | Original editable demonstration artwork                                                       |
| `src/style.css`    | Theme tokens and desktop, tablet, and phone layouts                                           |
| `vite.config.js`   | Production application-shell service worker generation                                        |
| `scripts/`         | Browser automation, application icons, and real screenshots                                   |
| `tests/`           | Editor regressions, professional tools, localization, touch, and offline checks               |

## Editing the interface

English is the base language. Put user-facing text in every catalog, then reference keys with `data-i18n`, `data-i18n-title`, or `data-i18n-aria-label`. Use `t(key, params)` for dynamic text. Do not insert user content as HTML.

System document and layer names store translation keys. Custom names are content, so they are never translated. When adding a locale, provide every key and preserve interpolation parameters; the tests check both.

Settings are separate from project files. Theme, language, pressure, finger drawing, stabilization, and fill tolerance are device preferences. Project version 3 additionally stores masks, clipping flags, transparency locks, and contiguous group membership. Version 1 and 2 projects remain readable. IndexedDB version 2 upgrades the existing document store in place and adds a separate checkpoint store.

## Validation

```sh
npm run build
npm test
```

Tests run sequentially to avoid competing Chromium instances and start their own Vite servers. They assert actual pixel changes, not merely that controls exist. `npm test` builds the current production app automatically before running the offline test. Do not reuse stale results after changing the app.

On Linux, tests use the bundled Chromium with multiple renderer processes and a writable font cache in the temporary directory. Other operating systems use Playwright's Chromium: run `npx playwright install chromium` first.

```sh
npm run preview
```

The preview uses port 4173. The dev server uses 5173. Both use strict ports. Reuse a correct existing server or diagnose a port conflict; do not kill unrelated processes. Processes must restart in a new cloud machine even when dependencies and built files are retained.

## Offline and installation

The production build creates a versioned service worker that precaches the HTML, hashed JS/CSS, manifest, and icons. Development does not register a service worker. The service worker keeps each HTML/asset version together, and new workers take over after old application clients close. It does not force a reload while someone is drawing.

Use HTTPS outside localhost. Install behavior, real stylus characteristics, and palm rejection must also be checked on physical devices before a device-specific release. Browser automation covers synthetic mouse, pen pressure, multitouch, offline reload, and several screen sizes; it is not a physical hardware certification.

## Screenshots

```sh
npm run build
npm run screenshots
```

Screenshots come from separate fresh browser contexts at desktop (1600 × 1050), tablet (1180 × 820), and phone (390 × 844) sizes. No screenshots are composited or mocked. Regenerate them after visible changes. To regenerate install icons from the vector mark, run `node scripts/generate-icons.mjs`.

## Persistence and limits

Autosaves are serialized through IndexedDB transactions. Each canvas has a stable ID. New canvases and imported projects retain previous work in the sketchbook. A best-effort unload recovery record supplements normal autosaves. Storage errors keep the current canvas intact and show a localized download reminder.

Raster operations allow 16 million pixels and 32 layers. Dirty-region redraw applies to ordinary brush strokes; symmetry and shape previews redraw fully. Masks and isolated groups cache surfaces by revision; clipping scratch surfaces are reused. PNG snapshots invalidate only after pixel edits. History counts unique encoded images/masks once, retains up to 80 entries, and trims to a 64/128 MB encoded-image budget. Canvas/GPU/native allocations are additional memory.

Mask pixels encode visibility in alpha. Black painting erases the mask alpha; white painting restores it. Raw artwork remains independent. Groups must be contiguous in document layer order, and opacity is applied after compositing the group's contents. Clipping uses the nearest non-clipping base within the same group. Merge is restricted to compatible, visible, unlocked Normal layers in the same group without clipping.

Autosaves and checkpoint writes are one transaction. Versions are bounded to 12 per document and restore to a new ID. Backup import validates all project metadata and decodes every layer/mask before writing any record in a single transaction. A backup transfers current canvases only; it does not include checkpoint history, device settings, or brush presets.

See [docs/NATIVE.md](docs/NATIVE.md) for native build and hardware validation instructions.
