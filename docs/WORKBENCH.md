# DrawSketch workbench

Version 0.5 adds the [precision studio](PRECISION.md), project format 4, and adaptive recording.

## Brushes

Click the active brush name to open the brush studio on any screen. The preview redraws as size, opacity, texture, pressure response, or the selected preset changes. Search the built-in brush names or your named presets and filter by Sketching, Ink & precision, Painting, or Custom.

Open **Pressure response**. Soft, Linear, and Firm provide starting curves; three controls set the output at 25%, 50%, and 75% input pressure. Endpoints are fixed at 0 and 1. Controls clamp against their neighbors, so a harder press cannot produce a smaller response. The engine linearly interpolates between points. Enable **Settings → Pen pressure** to use the curve. This maps input to the brush's existing width range; it does not remove each engine's minimum mark width or simulate physical pigment.

Save a named preset with a category. Presets contain the engine, size, opacity, pressure enablement and curve, texture, color pickup, stabilization, and tilt preference. Color remains your current foreground color. A library holds 32 custom presets. **Export brushes** writes a `.drawsketch-brushes` JSON file; **Import brushes** validates the entire file before appending any presets, assigns fresh IDs, and refuses imports that exceed capacity. It never silently discards existing presets. Legacy local presets receive a linear curve and a Custom category.

## References

The image button beside Timelapse opens a nonmodal reference panel. Add up to four PNG, JPEG, or WebP images per drawing, each at most 30 MB. Images are normalized to a longest side of 1600 pixels and stored as lossless PNGs with a combined 32 MB encoded-string budget. Normalization can resize very large sources; colors are picked from the normalized source, without the view's zoom/rotation interpolation.

Select an image, zoom, rotate, drag to pan, or use the arrow keys while the viewer is focused. **Pick color** changes the pointer to a color picker. **Fit image** resets zoom, rotation, and pan. On phones the panel can collapse to leave the canvas available. Close/reopen does not discard references.

References live in IndexedDB beside their drawing ID. They do not create artwork layers, appear in PNG exports, or change selection/history. They survive app reload. Duplicating/importing a drawing creates an independent ID and does not duplicate its references.

## Timelapse

The clock button opens the recording controls. **Start recording** captures the current canvas. Further frames record completed edits, including completed strokes, layer changes, and undo/redo. This is an edit-based timelapse, not screen capture: cursor motion, dialogs, and intermediate points inside a stroke are excluded. Paused edits are skipped; resuming records the current result before continuing. Stop keeps the existing recording. Use the frame slider to inspect it.

Each drawing retains up to 240 JPEG frames and an estimated 32 MB encoded-string budget. Quality profiles select a longest side of 512, 768, or 1024 pixels. Adaptive sampling compacts older intermediate frames to continue longer sessions while retaining the first and latest result; see PRECISION.md for details. The app persists recordings in IndexedDB and always reopens them paused. Transparent artwork is composited on white for video. Storage errors pause recording and ask you to export before closing. New document IDs have independent recordings.

**Export video** encodes frames at 6, 12, or 24 frames per second with no audio. It uses the runtime's supported MediaRecorder format, preferring WebM VP9/VP8, then MP4, then generic WebM. Export runs at playback speed and shows progress. Native mobile uses the system share sheet. A runtime without canvas recording can retain and preview frames but disables video export. Test export on your target browser/WebView; format support varies.

Clearing a recording requires an explicit checkbox. It removes frames only; your layers and history are kept.

## Sketchbook

Search drawing names, filter by folder and/or favorites, and sort by latest save or name. Create folders and move drawings through each card's menu. Empty folder names are local device preferences; folder assignments and favorite flags belong to saved document records. Autosaves merge with organization metadata in one transaction so drawing changes do not reset organization. Duplicate creates new document and project IDs, preserving the original artwork and organization. It does not copy checkpoints, references, or recordings.

Sketchbook backups include the current documents and their folder/favorite metadata. Import creates new IDs and validates all artwork before writing anything. Checkpoint history, reference images, timelapse frames, brush libraries, empty folders, and device preferences are not part of a sketchbook backup. Export presets and timelapse videos separately. Editable `.drawsketch` files contain artwork, layers, masks, and groups, without gallery organization or these device-local extras.

New-canvas presets include illustration, comic-page, social-post, and story dimensions. They set dimensions only; no guides, artwork, or print color profiles are added.

## Input diagnostics

Open **Settings → Test your pen** for a separate scratchpad. Light/heavy strokes and tilt display input type, pressure range, sample count, last tilt, and touch events ignored during active pen contact. Clearing the scratchpad never changes your drawing. Optional device and pen fields are included only in a report you explicitly export; no report or artwork is uploaded automatically.

Synthetic Chromium pen events verify the reporting and pressure path. A report is not a hardware certification. Follow the physical-device matrix in [NATIVE.md](NATIVE.md) for Apple Pencil, S Pen, and desktop digitizers. No physical pen tests have been run in the cloud environment.

## Storage compatibility

IndexedDB schema 3 upgrades the existing `documents` and `versions` stores in place and adds a `workspace` store for per-document references and recordings. Project format 4 adds palettes and adjustment parameters; project versions 1, 2, and 3 remain readable. Browser tests cover an actual schema-2 database migration without replacing the saved drawing.
