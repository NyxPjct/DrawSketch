import {
  neutralAdjustments,
  hasAdjustments,
  adjustmentFilter,
  adjustPixels,
} from "./color-model.js";
export function surface(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
export function dirty(canvas) {
  canvas._studioRevision = (canvas._studioRevision || 0) + 1;
  canvas._studioPNG = null;
}
export function encoded(canvas) {
  return (canvas._studioPNG ||= canvas.toDataURL("image/png"));
}
export function clone(canvas) {
  const copy = surface(canvas.width, canvas.height);
  copy.getContext("2d").drawImage(canvas, 0, 0);
  return copy;
}

export function adjustedLayer(layer) {
  const value = layer.adjustments || neutralAdjustments;
  if (!hasAdjustments(value)) return layer.canvas;
  const signature = `${layer.canvas._studioRevision || 0}:${JSON.stringify(value)}`;
  if (
    layer._adjustSignature !== signature ||
    layer._adjustSource !== layer.canvas
  ) {
    layer._adjusted ||= surface(layer.canvas.width, layer.canvas.height);
    const ctx = layer._adjusted.getContext("2d");
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    if ("filter" in ctx) {
      ctx.filter = adjustmentFilter(value);
      ctx.drawImage(layer.canvas, 0, 0);
      ctx.filter = "none";
    } else {
      ctx.drawImage(layer.canvas, 0, 0);
      const image = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
      adjustPixels(image.data, value);
      ctx.putImageData(image, 0, 0);
    }
    dirty(layer._adjusted);
    layer._adjustSignature = signature;
    layer._adjustSource = layer.canvas;
  }
  return layer._adjusted;
}
export function effectiveLayer(layer) {
  const image = adjustedLayer(layer);
  if (!layer.mask || layer.maskEnabled === false) return image;
  const signature = `${image._studioRevision || 0}:${layer.mask._studioRevision || 0}`;
  if (
    layer._maskSignature !== signature ||
    layer._maskSource !== layer.mask ||
    layer._maskImageSource !== image
  ) {
    layer._masked ||= surface(layer.canvas.width, layer.canvas.height);
    const ctx = layer._masked.getContext("2d");
    ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
    ctx.drawImage(image, 0, 0);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(layer.mask, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    layer._maskSignature = signature;
    layer._maskSource = layer.mask;
    layer._maskImageSource = image;
    dirty(layer._masked);
  }
  return layer._masked;
}

function paintBlock(ctx, layers, width, height, preview) {
  let base = null;
  for (const layer of layers) {
    let image = preview?.(layer) || effectiveLayer(layer);
    if (layer.clipping) {
      if (!base?.visible) continue;
      const signature = `${image._studioRevision || 0}:${layer.mask?._studioRevision || 0}:${base.image._studioRevision || 0}:${base.opacity}:${base.id}`;
      // Clipping depends on both source layers; scratch is reused without caching stale previews.
      layer._clipped ||= surface(width, height);
      const clip = layer._clipped.getContext("2d");
      if (
        layer._clipSignature !== signature ||
        layer._clipSource !== image ||
        layer._clipBase !== base.image
      ) {
        clip.clearRect(0, 0, width, height);
        clip.globalAlpha = 1;
        clip.globalCompositeOperation = "source-over";
        clip.drawImage(image, 0, 0);
        clip.globalCompositeOperation = "destination-in";
        clip.globalAlpha = base.opacity;
        clip.drawImage(base.image, 0, 0);
        clip.globalAlpha = 1;
        clip.globalCompositeOperation = "source-over";
        dirty(layer._clipped);
        layer._clipSource = image;
        layer._clipBase = base.image;
      }
      image = layer._clipped;
      layer._clipSignature = signature;
    } else
      base = {
        image,
        opacity: layer.opacity,
        visible: layer.visible,
        id: layer.id,
      };
    if (!layer.visible) continue;
    ctx.globalAlpha = layer.opacity;
    ctx.globalCompositeOperation = layer.blend;
    ctx.drawImage(image, 0, 0);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

export function renderScene(
  ctx,
  layers,
  groups,
  width,
  height,
  background = "white",
  rect = null,
  preview = null,
) {
  ctx.save();
  if (rect) {
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();
  }
  ctx.clearRect(0, 0, width, height);
  if (background !== "transparent") {
    ctx.fillStyle = background === "warm" ? "#f6efdf" : "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  for (let index = 0; index < layers.length; ) {
    const layer = layers[index],
      group = groups.find((group) => group.id === layer.groupId);
    if (!group) {
      const clips = collectClips(layers, index);
      paintBlock(ctx, [layer, ...clips], width, height, preview);
      index += 1 + clips.length;
      continue;
    }
    const block = [];
    while (index < layers.length && layers[index].groupId === group.id)
      block.push(layers[index++]);
    if (!group.visible) continue;
    group._surface ||= surface(width, height);
    if (group._surface.width !== width || group._surface.height !== height)
      group._surface = surface(width, height);
    const signature = block
      .map((item) =>
        [
          item.id,
          item.canvas._studioRevision || 0,
          item.mask?._studioRevision || 0,
          item.maskEnabled,
          item.visible,
          item.opacity,
          item.blend,
          item.clipping,
          JSON.stringify(item.adjustments || neutralAdjustments),
        ].join(":"),
      )
      .join("|");
    if (preview || group._signature !== signature) {
      const target = group._surface.getContext("2d");
      target.clearRect(0, 0, width, height);
      paintBlock(target, block, width, height, preview);
      // A temporary preview must not become the committed group's cached surface.
      group._signature = preview ? null : signature;
    }
    ctx.globalAlpha = group.opacity;
    ctx.drawImage(group._surface, 0, 0);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
function collectClips(layers, index) {
  const result = [];
  for (
    let i = index + 1;
    i < layers.length &&
    layers[i].clipping &&
    layers[i].groupId === layers[index].groupId;
    i++
  )
    result.push(layers[i]);
  return result;
}

export function assignGroup(layers, layer, groupId) {
  const index = layers.indexOf(layer);
  layers.splice(index, 1);
  layer.groupId = groupId || null;
  let destination = groupId
    ? layers.findLastIndex((item) => item.groupId === groupId)
    : -1;
  layers.splice(
    destination >= 0 ? destination + 1 : Math.min(index, layers.length),
    0,
    layer,
  );
}
export function reorderLayer(layers, layer, offset) {
  const from = layers.indexOf(layer);
  let to = from + offset;
  if (to < 0 || to >= layers.length) return;
  const neighbor = layers[to];
  if (layer.groupId !== neighbor.groupId) {
    layer.groupId = null;
    if (neighbor.groupId) {
      while (
        to + offset >= 0 &&
        to + offset < layers.length &&
        layers[to + offset].groupId === neighbor.groupId
      )
        to += offset;
    }
  }
  layers.splice(from, 1);
  layers.splice(to, 0, layer);
}
