# DrawSketch 0.6 — Precision & Study

Open these tools from **Settings**, or assign them to the quick-action bar in **Workspace & shortcuts**. All controls and notifications support English, Brazilian Portuguese, and Spanish.

## Drawing guides

Choose a straight ruler, an ellipse, or one-, two-, or three-point perspective. Adjust the ruler angle, center, ellipse radii, horizon, vanishing-point spacing, and third vanishing-point height. Perspective points can sit outside the canvas. The canvas grid accepts 0–12 divisions; 0 turns it off. A grid of 3 matches the study reference thirds grid.

Enable **Snap strokes to this guide** to constrain brush and eraser input. Rulers project onto their full line. Ellipses project onto their outline. Perspective chooses the closest direction at the start of a moving stroke and keeps that direction until release; one-point perspective also offers horizontal/vertical axes, and two-point perspective offers verticals. Pressure and tilt remain attached to the projected samples. Normal symmetry and selection clipping still apply afterward. Shape and selection tools keep their existing behavior.

Guides are SVG overlays and are never baked into layer pixels, PNGs, project images, or timelapse frames. Guide settings are saved per document in the local workspace. They are not undo entries and do not travel in project or sketchbook backups. Turn snapping off when practicing freehand beside an exercise template.

**Mirror the canvas view** changes viewing and input coordinates, including rotated zoom anchoring. **View artwork in grayscale** is a temporary CSS view. Both preserve the original orientation and color in saved pixels and exports. They reset when the app reloads. They are observation aids, not layer transforms or color adjustments.

## Professional bucket fill

Open **Professional fill** to choose **Active layer** or **All visible layers** as the source of boundaries. The latter reads a transparent composite including layer visibility, opacity, groups, masks, clipping, and color adjustments. It writes only to the active target, leaving other layers untouched. Canvas background paper is not a boundary layer.

**Close small gaps** applies binary morphological closing with a square radius of 0–8 artwork pixels. It can bridge small openings in a contour. **Expand filled region** extends the connected region by a square radius of 0–12 artwork pixels. Use a separate color layer below line art when expanding: expansion on a layer containing the line art can paint over its edge. Pixel radii are independent of zoom.

Gap closure is approximate. Intersections, larger openings, antialiasing, and similar neighboring colors can affect boundaries. Inspect the result and Undo when needed. The existing fill tolerance still controls color matching. Reference pixels are never modified. Selection clipping and alpha-lock behavior still apply. Mask painting keeps its original active-mask fill path.

The operation runs in the existing worker. Advanced morphology requires additional temporary RGBA and binary buffers proportional to canvas size; a maximum-size document still needs substantial device memory. The default zero-gap/zero-expansion active-layer fill retains its previous scanline path. There is no AI boundary inference.

## Study studio

Choose gesture drawing, confident lines, ellipses/forms, or a five-value study. Set 10–3600 seconds per round and 1–20 rounds. Start on the current drawing or use **Create a new study canvas**, which opens the normal new-canvas dialog and preserves the current drawing in the sketchbook. A study session never clears artwork automatically.

Line, ellipse, and value exercises show non-exported templates on the canvas. Gesture practice uses your own references. Add PNG/JPEG/WebP files up to 30 MB each, or use the selected image from the regular reference panel. The study queue holds up to 12 images, resized proportionally to a maximum 1024-pixel side. A reference-thirds grid helps compare proportions without changing the reference source. Next round advances the queue and wraps when needed.

The timer uses a monotonic deadline and counts down while drawing. Pause/resume is manual; leaving the app, changing documents, opening study management, or closing the study panel pauses it. A finished round stays stopped until you choose **Next round**. The compact panel hides reference/details while keeping time and controls visible; it starts compact on narrow phones and can be expanded at any time. Timers do not run or survive after the app is closed; unfinished rounds are not entered into history.

The last 100 completed rounds keep their exercise, duration, completion date, thumbnail, and link to the canvas in local IndexedDB. The thumbnail captures the current artwork, excluding templates, guides and CSS view effects. Open a history entry to reopen its saved canvas through the normal save/recovery workflow. Deleting a canvas does not delete its study thumbnail; its history link then explains that the original is unavailable. Reference queues and study history remain on this device and are outside project/sketchbook backups. Export the actual drawing normally to keep or transfer it.

## Compatibility and validation

Project format remains **4**, and IndexedDB schema remains **3**. Existing project formats 1–4 remain readable. Guides use the existing per-document workspace; studies use a dedicated workspace record without changing document/checkpoint/reference/recording stores.

Tests cover projected geometry, real brush/fill pixels, contour-reference preservation, undo, saved guide preferences, mirrored input, original exported colors, deadline rounding, a completed timer, bounded history/reference queues, preserved reference aspect ratio, translation catalogs and responsive controls. Automated synthetic input does not certify a physical pen, palm rejection, sustained low-memory use, or print color accuracy. Native signing and physical-device requirements remain in [NATIVE.md](NATIVE.md) and [DISTRIBUTION.md](DISTRIBUTION.md).

OpenRaster exchange, print/PDF controls, and four-corner perspective transforms remain future work.
