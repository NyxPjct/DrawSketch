import { surface, clone } from "./canvas.js";

export class Selection {
  constructor(width, height) {
    this.resize(width, height);
  }
  resize(width, height) {
    this.width = width;
    this.height = height;
    this.clear();
  }
  clear() {
    this.path = null;
    this.bounds = null;
    this.points = [];
    this.floating = null;
  }
  all() {
    this.rectangle({ x: 0, y: 0 }, { x: this.width, y: this.height });
  }
  rectangle(a, b) {
    const x = Math.max(0, Math.min(a.x, b.x)),
      y = Math.max(0, Math.min(a.y, b.y)),
      right = Math.min(this.width, Math.max(a.x, b.x)),
      bottom = Math.min(this.height, Math.max(a.y, b.y));
    this.points = [
      { x, y },
      { x: right, y },
      { x: right, y: bottom },
      { x, y: bottom },
    ];
    this.finishPath();
  }
  lasso(points) {
    this.points = points.map((p) => ({
      x: Math.max(0, Math.min(this.width, p.x)),
      y: Math.max(0, Math.min(this.height, p.y)),
    }));
    this.finishPath();
  }
  finishPath() {
    if (this.points.length < 3) {
      this.clear();
      return;
    }
    const xs = this.points.map((p) => p.x),
      ys = this.points.map((p) => p.y),
      x = Math.floor(Math.min(...xs)),
      y = Math.floor(Math.min(...ys)),
      right = Math.ceil(Math.max(...xs)),
      bottom = Math.ceil(Math.max(...ys));
    if (right - x < 1 || bottom - y < 1) {
      this.clear();
      return;
    }
    const path = new Path2D();
    path.moveTo(this.points[0].x, this.points[0].y);
    for (const point of this.points.slice(1)) path.lineTo(point.x, point.y);
    path.closePath();
    this.path = path;
    this.bounds = { x, y, width: right - x, height: bottom - y };
  }
  clip(ctx, draw) {
    ctx.save();
    if (this.path) ctx.clip(this.path);
    draw();
    ctx.restore();
  }
  begin(canvas) {
    if (!this.path) this.all();
    if (this.floating) return;
    const mask = surface(this.width, this.height),
      maskContext = mask.getContext("2d");
    maskContext.fillStyle = "#fff";
    maskContext.fill(this.path);
    const base = clone(canvas),
      baseContext = base.getContext("2d");
    baseContext.globalCompositeOperation = "destination-out";
    baseContext.drawImage(mask, 0, 0);
    baseContext.globalCompositeOperation = "source-over";
    const { x, y, width, height } = this.bounds,
      piece = surface(width, height),
      ctx = piece.getContext("2d");
    ctx.drawImage(canvas, -x, -y);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(mask, -x, -y);
    ctx.globalCompositeOperation = "source-over";
    this.floating = {
      target: canvas,
      base,
      piece,
      x: x + width / 2,
      y: y + height / 2,
      width,
      height,
      rotation: 0,
      flipX: false,
      flipY: false,
      preview: surface(this.width, this.height),
    };
  }
  preview() {
    const f = this.floating;
    if (!f) return null;
    const ctx = f.preview.getContext("2d");
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.drawImage(f.base, 0, 0);
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate((f.rotation * Math.PI) / 180);
    ctx.scale(f.flipX ? -1 : 1, f.flipY ? -1 : 1);
    ctx.drawImage(f.piece, -f.width / 2, -f.height / 2, f.width, f.height);
    ctx.restore();
    return f.preview;
  }
  apply() {
    const f = this.floating;
    if (!f) return null;
    const result = this.preview(),
      ctx = f.target.getContext("2d");
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.drawImage(result, 0, 0);
    const target = f.target;
    this.clear();
    return target;
  }
  erase(canvas) {
    if (!this.path) return;
    const ctx = canvas.getContext("2d");
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "#fff";
    ctx.fill(this.path);
    ctx.restore();
    this.clear();
  }
  outline(ctx) {
    ctx.clearRect(0, 0, this.width, this.height);
    if (!this.path) return;
    ctx.save();
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 5]);
    ctx.strokeStyle = "#ff8a24";
    if (this.floating) {
      const f = this.floating;
      ctx.translate(f.x, f.y);
      ctx.rotate((f.rotation * Math.PI) / 180);
      ctx.strokeRect(-f.width / 2, -f.height / 2, f.width, f.height);
    } else ctx.stroke(this.path);
    ctx.restore();
  }
}
