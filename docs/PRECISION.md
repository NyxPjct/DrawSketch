# DrawSketch 0.5 precision studio

## Find the new tools

The floating quick-action bar starts with **Canvas navigator**, **Project palettes**, and **Layer color adjustments**. Open **Settings → Workspace & shortcuts** to assign up to four actions, change handedness, edit shortcuts, or open **Performance**. All new controls are translated into English, Brazilian Portuguese, and Spanish. English remains the default.

## Canvas navigator

The navigator shows a cached overview of the artwork and an orange polygon for the current viewport. The polygon includes rotation. Click or drag inside the overview to center that point in the editor without changing zoom or rotation. Focus the overview and use arrow keys to move by a fraction of the visible area. The zoom slider and Fit canvas button use the same coordinate mapping as the main editor.

The overview is refreshed at most about five times a second while open; panning and zooming redraw its viewport outline without rebuilding the thumbnail. Closed navigators do not allocate a stream of redraw work. Navigation does not change the artwork or create undo entries.

## Palettes that travel with your project

Each drawing can contain eight palettes of up to 32 colors, plus 64 favorite colors. Use an optional name or the translated default name. Add the current foreground color, remove it, favorite it, or switch to the favorites view. Clicking a swatch selects it for painting.

**Extract from reference** uses the currently selected, loaded reference image. **Extract from image** accepts PNG, JPEG, or WebP files up to 30 MB. The image is downsampled to 128 × 128; opaque pixels are grouped by RGB color and up to eight distinct frequent colors are appended to the palette. Existing colors are preserved. Extraction is an RGB approximation, not a color-profile or pigment analysis. A full palette refuses additions rather than silently replacing existing colors.

Palette edits are undoable after closing the dialog. Palettes and favorites are part of the editable project, autosave, checkpoints, sketchbook duplication, and sketchbook backup. They are separate from the device's interface preferences. Project imports validate palette structure and colors before replacing any active drawing.

## Editable layer color

Select a layer and open **Layer color adjustments**. Brightness, contrast, and saturation range from −100 to +100; hue ranges from −180° to +180°. Preview changes and choose Apply, Cancel, or Reset adjustments. Locked layers cannot be adjusted.

Preview uses a separate layer representation. Pending autosaves continue to store the committed adjustments, including a matching thumbnail. Canceling or pressing Escape restores the committed rendering without altering the raw image. Apply creates an undo entry and keeps the parameters editable. Masks remain independent, and groups and clipping use the adjusted appearance. Duplicating a layer copies its settings. Merging compatible layers bakes their visible result into a new neutral layer, preserving the merged appearance.

Canvas filter support is used when available; a pixel-matrix fallback supports WebViews without that API. Both preserve alpha. Rendered surfaces are cached by image revision and adjustment values. Mask and clipping caches invalidate when their dependencies change. Temporary previews invalidate group caches on cancellation, preventing a preview from becoming a saved appearance. Browser/WebView filter implementations can differ slightly in rounding and color handling.

These are raster-layer color adjustments, not independent adjustment-layer objects or ICC/CMYK color management.

## Controls for your hands and keyboard

Left-handed layout swaps the side panels and places the vertical tool palette on the opposite side. Phone/tablet properties drawers follow the selected side. Landscape phones keep the compact horizontal tool palette. Preferences survive reopening the app.

Each configurable drawing shortcut accepts one letter or `[` / `]`. Keys must be unique; an empty field disables that action. The editor does not intercept typing inside inputs, editable text, or dialogs. Ctrl/⌘ Save, Undo/Redo, Space, Tab, and Escape retain their standard behavior. Tooltips and the shortcut guide reflect remapped tool keys. Restore default controls resets handedness, quick actions, and the editable key map.

Quick actions can launch navigation, palettes, color adjustments, timelapse, references, undo, redo, fit, focus, the brush studio, or performance. Empty slots disappear. Changes affect this device only and do not modify project files.

## Timelapse for longer sessions

Recordings still retain at most 240 frames and an estimated 32 MB of encoded frame strings per drawing. Reaching a bound now compacts older intermediate frames and increases the sampling interval instead of normally pausing the whole session. The first frame is retained, along with the latest captured result. The final result is flushed when pausing, stopping, switching drawings, opening the recording dialog, or leaving the app. An idle debounce also captures the latest pending result. Intermediate edits may be discarded deliberately; this is a sampled timelapse, not a lossless replay of every edit.

Choose quality before the first frame:

| Profile  | Longest side | JPEG quality |
| -------- | ------------ | ------------ |
| Compact  | 512 px       | 0.65         |
| Balanced | 768 px       | 0.80         |
| High     | 1024 px      | 0.90         |

Existing 0.4 recordings reopen with Balanced settings and retain their existing frames. Reopened recordings always start paused. Quality is locked once frames exist so a single recording has consistent dimensions. Video export supports 6, 12, or 24 frames per second and runs at playback speed. The runtime chooses WebM/MP4 according to its recording support. Export cannot be dismissed while encoding. Storage errors still pause recording; quota and shutdown behavior depend on the browser/device.

Writes are coalesced per drawing so slow storage does not build an unbounded queue of obsolete recording snapshots. Reference and recording patches use the same transactional workspace store without replacing each other's fields. Export videos separately; timelapse frames remain device-local and are not included in project/backup files.

## Measure before tuning

**Performance** displays up to 128 recent measurements per category: brush-segment processing, canvas compositing, worker-fill completion, and input-event timestamp to completed Canvas rendering. Median and 95th percentile values describe software timing. They exclude physical pen latency, operating-system digitizer behavior, GPU presentation, and display latency. Clear measurements before a comparable session.

Memory figures estimate unique artwork surfaces at four bytes per pixel and unique PNG history strings at two bytes per character. They exclude additional GPU/native/browser allocations, the reference and timelapse stores, overlay canvases, and other work buffers. A JavaScript heap observation is included in exported reports only if the runtime exposes it. These are estimates, not a total-memory limit or cross-device certification.

The benchmark creates a separate 640 × 480 fixture: 400 ink segments, one worker fill, and ten renders of eight layers. It does not change or save the current artwork. Compare the same app build and benchmark on your own devices. Exported JSON includes app/runtime information, canvas dimensions, metrics, estimates, and benchmark results, without artwork. Nothing is uploaded automatically.

## Compatibility and device validation

New `.drawsketch` files use **project format 4** for palettes, favorite colors, and adjustment parameters. Versions 1, 2, and 3 remain readable with empty palettes and neutral adjustments. Older DrawSketch releases cannot read format 4, so keep a copy of an older project if you need to return to an earlier app. IndexedDB schema remains 3; existing document, checkpoint, reference, and recording stores upgrade in place without another database migration.

Automated tests verify actual pixels, raw-image preservation, preview/autosave isolation, cached mask/clipping/group invalidation, rotated navigation, file round trips, controls on phone/tablet sizes, a benchmark that leaves artwork unchanged, and adaptive recording beyond the previous bound. Physical pen, palm, low-memory-device endurance, publisher signing, and actual iOS-device installation still require the hardware/accounts listed in [NATIVE.md](NATIVE.md) and [DISTRIBUTION.md](DISTRIBUTION.md).
