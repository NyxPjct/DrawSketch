# DrawSketch

**Your studio. Everywhere.**

A personal drawing studio for desktop, tablet, and phone, with an orange and black workspace. Pick up a pen, make a little mess, and find your flow. DrawSketch combines a focused canvas with expressive brushes, real layers, touch gestures, and a sketchbook that stays on your device.

Built with JavaScript, Canvas 2D, and Vite. No account, API key, backend, or uploaded artwork required.

## A studio for every screen

These are actual screenshots of the running production app, captured with Chromium. The artwork is an original, editable Canvas demonstration included with the app.

### Desktop

Your brush library, canvas, colors, and layers in one workspace.

![DrawSketch desktop drawing studio with the original Desert Reverie illustration](docs/screenshots/desktop.png)

### Tablet

A larger canvas, stylus support, and two-finger navigation. Tap the active brush name to open the full brush studio.

![DrawSketch tablet layout with a touch-friendly toolbar and layers panel](docs/screenshots/tablet.png)

### Phone

A dedicated compact layout with colors and layers available in a drawer.

<p>
  <img src="docs/screenshots/mobile.png" width="300" alt="DrawSketch phone canvas and drawing tools" />
  <img src="docs/screenshots/mobile-layers.png" width="300" alt="DrawSketch phone color and layer drawer" />
</p>

## Made for the way you draw

| Area             | What you can do                                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Brushes          | Graphite, studio pen, marker, watercolor, airbrush, charcoal, bristle, and pixel pen, each with a different stroke engine               |
| Stroke control   | Adjust size, opacity, stabilization, and supported stylus pressure; preview your brush live                                             |
| Drawing tools    | Erase, fill connected areas, pick colors, draw lines, rectangles, and ellipses; fill shapes or constrain them with Shift                |
| Symmetry         | Mirror your marks vertically, horizontally, or on both axes                                                                             |
| Layers           | Add, select, rename, duplicate, lock, hide, reorder, and adjust opacity; merge normal layers                                            |
| Blending         | Normal, Multiply, Screen, and Overlay                                                                                                   |
| Canvas           | Pan, zoom around your cursor, rotate, toggle a grid, and enter focus mode                                                               |
| Touch            | Two-finger pan, pinch zoom, and rotation; optional finger drawing, with touch ignored while a pen stroke is active                      |
| Files            | Import PNG, JPEG, WebP, or GIF images; export PNG with a white, warm, or transparent background; reopen editable `.drawsketch` projects |
| Your sketchbook  | Separate canvases, automatic saves in IndexedDB, thumbnails, and recovery after reloading                                               |
| Your preferences | Dark, light, or device theme; language, pressure, touch, stabilization, and fill tolerance saved locally                                |
| Everywhere       | Installable progressive web app with a cached application shell for offline drawing                                                     |

## English first. Your language, everywhere.

The app starts in **English**. Open **Settings → Language** to switch to:

- English
- Português (Brasil)
- Español

The entire application interface updates immediately: panels, menus, dialogs, options, tooltips, accessibility labels, notifications, dates, and automatically generated document and layer names. Your selection survives a reload. Artwork and names you write yourself are preserved.

Translations live in [`src/i18n.js`](src/i18n.js). The test suite checks that every language has the same keys and interpolation parameters and verifies the rendered interface in each language.

## Run locally

Use **Node.js 24 (or 22.17+)** and npm. Development is validated on Node.js 24.

```sh
npm ci
npm run dev
```

The development server uses port **5173**. In the managed cloud environment, use a writable npm cache if installing dependencies:

```sh
npm ci --cache /workspace/.cache/npm --no-audit --no-fund
```

Build and validate:

```sh
npm run build
npm test
npm run preview
```

The preview serves `dist/` on port **4173**. Offline support is enabled in production builds. Deploy the contents of `dist/` to an HTTPS static host.

## Install on your device

- **Desktop / Android:** use your browser's Install option, or the Install DrawSketch button in Settings when the browser offers installation.
- **iPhone / iPad:** open the app in Safari, choose Share, then Add to Home Screen.
- Open the production app online once and allow its offline cache to finish. The application can then reopen, draw, and save locally without a connection.

This release is an installable web app. Native desktop binaries and App Store / Play Store packages are not included. Browser installation support and stylus behavior depend on the device and browser.

## Keep your work

The sketchbook uses storage belonging to the current browser, device, and site address. It does not sync between devices. Clearing site data can remove local drawings.

Use **Save project** to download all your editable layers as a `.drawsketch` file. Use **Open project** to continue on another device. PNG export gives you the flattened image. If storage is unavailable or full, the app tells you to download your project.

## Keyboard and gestures

| Action                     | Shortcut                                        |
| -------------------------- | ----------------------------------------------- |
| Brush / Eraser             | `B` / `E`                                       |
| Fill / Eyedropper          | `G` / `I`                                       |
| Line / Rectangle / Ellipse | `L` / `R` / `O`                                 |
| Pan                        | `H`, hold `Space`, or middle mouse button       |
| Undo / Redo                | `Ctrl/⌘ Z` / `Ctrl/⌘ Shift Z`                   |
| Save editable project      | `Ctrl/⌘ S`                                      |
| Brush size                 | `[` / `]`                                       |
| Fit canvas                 | `F`                                             |
| Focus mode                 | Toolbar button; `Tab` when the canvas has focus |
| Constrain a shape          | Hold `Shift`                                    |
| Zoom around pointer        | `Ctrl/⌘` + scroll                               |
| Touch navigation           | Use two fingers to pan, pinch, and rotate       |

## Tests and screenshots

The browser tests verify rendered pixels, undo/redo, brush behavior, layers and blending, pen pressure, touch gestures, file round trips, local recovery, complete localization, responsive layouts, and offline production use. Linux tests use the Chromium binary bundled in `@sparticuz/chromium`, without a separate browser download. On other platforms, install Chromium once with `npx playwright install chromium`.

Regenerate the README screenshots from the real production app:

```sh
npm run build
npm run screenshots
```

The capture script starts its own preview server on port 4175. The test servers use ports 5174, 5176, and 4176. See [`DEVELOPMENT.md`](DEVELOPMENT.md) for the architecture and development workflow.

## Current limits

Canvases support up to 24 raster layers and 12 million pixels, with each side between 64 and 4096 pixels. Undo history is bounded by estimated memory use. Project imports are limited to 30 MB. PSD files, external brush formats, vector editing, cloud collaboration, and native device testing are outside this release.
