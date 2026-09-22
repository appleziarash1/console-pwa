import { clamp, damp, lerp } from './utils.js';

/**
 * Side-scrolling platform camera with look-ahead, deadzone and screen shake.
 */
export class Camera {
  constructor() {
    this.x = 0; this.y = 0;
    this.vw = 1280; this.vh = 720;
    this.zoom = 1;
    this.targetZoom = 1;
    this.shakeTime = 0; this.shakeMag = 0;
    this.offsetX = 0; this.offsetY = 0;
    this.bounds = null;          // {x,y,w,h} world limits
    this.lookAhead = 0;
    this.deadzoneX = 90;
    this.deadzoneY = 70;
  }

  setViewport(w, h) { this.vw = w; this.vh = h; }
  setBounds(b) { this.bounds = b; }
  shake(mag, time = 0.3) { this.shakeMag = Math.max(this.shakeMag, mag); this.shakeTime = Math.max(this.shakeTime, time); }
  snapTo(x, y) { this.x = x - this.vw / this.zoom / 2; this.y = y - this.vh / this.zoom / 2; this._clamp(); }

  follow(target, dt) {
    const viewW = this.vw / this.zoom;
    const viewH = this.vh / this.zoom;
    const desiredZoom = clamp(Math.min(this.vw / 1180, this.vh / 640), 0.62, 1.35);
    this.targetZoom = desiredZoom * (target.zoomedOut ? 0.78 : 1);
    this.zoom = damp(this.zoom, this.targetZoom, 3.2, dt);

    const aimX = target.x + (target.facing * this.deadzoneX * 0.9) + this.lookAhead;
    const aimY = target.y - viewH * 0.06;

    let cx = this.x + viewW / 2;
    let cy = this.y + viewH / 2;

    if (Math.abs(aimX - cx) > this.deadzoneX) {
      cx = damp(cx, aimX - Math.sign(aimX - cx) * this.deadzoneX, 5.5, dt);
    } else if (Math.abs(target.vx) > 60) {
      cx = damp(cx, aimX, 1.6, dt);
    }
    cy = damp(cy, aimY, 4.2, dt);

    this.x = cx - viewW / 2;
    this.y = cy - viewH / 2;
    this._clamp();

    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const f = Math.max(0, this.shakeTime) * 3.2;
      this.offsetX = (Math.random() * 2 - 1) * this.shakeMag * f;
      this.offsetY = (Math.random() * 2 - 1) * this.shakeMag * f;
      if (this.shakeTime <= 0) { this.shakeMag = 0; this.offsetX = 0; this.offsetY = 0; }
    }
  }

  _clamp() {
    if (!this.bounds) return;
    const viewW = this.vw / this.zoom;
    const viewH = this.vh / this.zoom;
    const { x, y, w, h } = this.bounds;
    if (w > viewW) this.x = clamp(this.x, x, x + w - viewW); else this.x = x + (w - viewW) / 2;
    if (h > viewH) this.y = clamp(this.y, y, y + h - viewH); else this.y = y + (h - viewH) / 2;
  }

  applyTransform(ctx) {
    ctx.setTransform(this.zoom, 0, 0, this.zoom, -this.x * this.zoom + this.offsetX, -this.y * this.zoom + this.offsetY);
  }

  screenToWorld(sx, sy) {
    return { x: sx / this.zoom + this.x, y: sy / this.zoom + this.y };
  }

  worldToScreen(wx, wy) {
    return { x: (wx - this.x) * this.zoom, y: (wy - this.y) * this.zoom };
  }

  get view() { return { x: this.x, y: this.y, w: this.vw / this.zoom, h: this.vh / this.zoom }; }
}

/** Parallax background drawer: sky gradient, far silhouettes, mid buildings, fog. */
export class Backdrop {
  constructor() {
    this.layers = [];
  }
  rebuild(rng, palette, districtSeed) {
    this.palette = palette;
    this.layers = [];
    for (let l = 0; l < 3; l++) {
      const shapes = [];
      const count = 26 + l * 10;
      for (let i = 0; i < count; i++) {
        shapes.push({
          x: rng.range(-400, 4200),
          w: rng.range(70, 220) * (1 + l * 0.35),
          h: rng.range(120, 420) * (1 + l * 0.28),
          win: rng.int(0, 4),
          spire: rng.chance(0.25),
        });
      }
      this.layers.push({ shapes, depth: 0.12 + l * 0.16 });
    }
    this.moonPhase = rng.next();
    this.seed = districtSeed;
  }
  draw(ctx, cam, env) {
    if (!this.palette) return;
    const { vw, vh } = cam;
    const night = env.night;
    const sky = ctx.createLinearGradient(0, 0, 0, vh);
    if (night) {
      sky.addColorStop(0, '#0a0d1a'); sky.addColorStop(0.55, '#131426'); sky.addColorStop(1, '#1c1620');
    } else if (env.dusk) {
      sky.addColorStop(0, '#3a2a3e'); sky.addColorStop(0.5, '#6b3f3a'); sky.addColorStop(1, '#c07a4a');
    } else {
      sky.addColorStop(0, '#5b7d9c'); sky.addColorStop(0.6, '#9bb0bd'); sky.addColorStop(1, '#c8b9a4');
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, vw, vh);

    // Sun / moon
    const skyY = night ? vh * 0.16 : vh * 0.2;
    const skyX = vw * (0.68 + (this.moonPhase - 0.5) * 0.2) - cam.x * 0.02;
    ctx.globalAlpha = night ? 0.85 : 0.55;
    const glow = ctx.createRadialGradient(skyX, skyY, 4, skyX, skyY, night ? 90 : 160);
    glow.addColorStop(0, night ? 'rgba(226,230,255,.95)' : 'rgba(255,238,200,.95)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(skyX, skyY, night ? 90 : 160, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    const horizon = cam.y + cam.vh / cam.zoom * 0.6;
    for (const layer of this.layers) {
      const px = -cam.x * layer.depth;
      const py = -cam.y * layer.depth * 0.45;
      const baseY = (horizon - py) * 0 + vh * 0.82 + (cam.y - horizon) * layer.depth * 0.2;
      ctx.fillStyle = this.palette.far[layer.depth > 0.3 ? 2 : 1] || this.palette.far[0];
      ctx.globalAlpha = 0.55 + layer.depth;
      for (const s of layer.shapes) {
        const bx = s.x + px;
        if (bx + s.w < -80 || bx > vw + 80) continue;
        ctx.fillRect(bx, baseY - s.h, s.w, s.h + vh);
        if (s.spire) ctx.fillRect(bx + s.w * 0.4, baseY - s.h - 40, s.w * 0.2, 40);
      }
      ctx.globalAlpha = 1;
    }

    // Weather overlay
    if (env.fog) {
      const fog = ctx.createLinearGradient(0, vh * 0.35, 0, vh);
      fog.addColorStop(0, 'rgba(180,185,195,0)');
      fog.addColorStop(1, `rgba(180,185,195,${env.fog})`);
      ctx.fillStyle = fog; ctx.fillRect(0, 0, vw, vh);
    }
    if (env.tint) {
      ctx.fillStyle = env.tint;
      ctx.fillRect(0, 0, vw, vh);
    }
    if (env.vignette) {
      const v = ctx.createRadialGradient(vw / 2, vh / 2, vh * 0.3, vw / 2, vh / 2, vh * 0.85);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, `rgba(0,0,0,${env.vignette})`);
      ctx.fillStyle = v; ctx.fillRect(0, 0, vw, vh);
    }
  }
}
