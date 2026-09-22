import { clamp, lerp, uid, RNG } from './utils.js';

/**
 * Lightweight particle system. Particles are pooled and drawn in world space by
 * the renderer. Types: spark, blood, smoke, dust, ember, coin, ring, text.
 */
const POOL = [];

function acquire() {
  return POOL.pop() || {};
}

function release(p) {
  p.dead = true;
  if (POOL.length < 900) POOL.push(p);
}

export class ParticleSystem {
  constructor() {
    this.items = [];
    this.shockwaves = [];
  }

  clear() { this.items.length = 0; this.shockwaves.length = 0; }

  spawn(type, x, y, opts = {}) {
    const p = acquire();
    p.type = type;
    p.x = x; p.y = y;
    p.vx = opts.vx ?? 0; p.vy = opts.vy ?? 0;
    p.life = 0; p.maxLife = opts.life ?? 0.6;
    p.size = opts.size ?? 3;
    p.color = opts.color ?? '#ffffff';
    p.gravity = opts.gravity ?? 0;
    p.drag = opts.drag ?? 0.9;
    p.rot = opts.rot ?? 0;
    p.spin = opts.spin ?? 0;
    p.text = opts.text ?? '';
    p.dead = false;
    this.items.push(p);
    return p;
  }

  burst(type, x, y, count, opts = {}) {
    const rng = new RNG((Math.random() * 1e9) | 0);
    for (let i = 0; i < count; i++) {
      const a = rng.range(0, Math.PI * 2);
      const sp = rng.range(opts.minSpeed ?? 30, opts.maxSpeed ?? 140);
      this.spawn(type, x + rng.range(-4, 4), y + rng.range(-4, 4), {
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (opts.up ?? 0),
        life: rng.range(opts.minLife ?? 0.25, opts.maxLife ?? 0.7),
        size: rng.range(opts.minSize ?? 1.5, opts.maxSize ?? 3.5),
        color: Array.isArray(opts.colors) ? rng.pick(opts.colors) : (opts.color ?? '#fff'),
        gravity: opts.gravity ?? 320,
        drag: opts.drag ?? 2.2,
      });
    }
  }

  cone(type, x, y, dirX, count, opts = {}) {
    const rng = new RNG((Math.random() * 1e9) | 0);
    for (let i = 0; i < count; i++) {
      const spread = rng.range(-0.5, 0.5);
      const sp = rng.range(opts.minSpeed ?? 40, opts.maxSpeed ?? 160);
      this.spawn(type, x, y, {
        vx: dirX * sp * Math.cos(spread),
        vy: -sp * Math.sin(spread) * 0.6 + (opts.up ?? -10),
        life: rng.range(0.2, 0.6),
        size: rng.range(1.5, 3.5),
        color: Array.isArray(opts.colors) ? rng.pick(opts.colors) : (opts.color ?? '#ddd'),
        gravity: opts.gravity ?? 200,
        drag: 2.5,
      });
    }
  }

  ring(x, y, opts = {}) {
    this.shockwaves.push({
      x, y, r: opts.r0 ?? 4, rMax: opts.rMax ?? 90,
      life: 0, maxLife: opts.life ?? 0.35,
      color: opts.color ?? 'rgba(240,207,107,.8)',
      width: opts.width ?? 3,
    });
  }

  floatingText(x, y, text, color = '#f0cf6b') {
    this.spawn('text', x, y, { vy: -46, life: 0.9, color, text });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.life += dt;
      if (p.life >= p.maxLife) { this.items.splice(i, 1); release(p); continue; }
      p.vy += p.gravity * dt;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy *= d;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.spin * dt;
      if (p.type === 'smoke') p.size *= 1 + 0.9 * dt;
    }
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      s.life += dt;
      const t = s.life / s.maxLife;
      s.r = lerp(s.r, s.rMax, 1 - Math.exp(-6 * dt));
      if (t >= 1) this.shockwaves.splice(i, 1);
    }
  }

  draw(ctx) {
    for (const p of this.items) {
      const t = p.life / p.maxLife;
      const alpha = 1 - t;
      ctx.globalAlpha = clamp(alpha, 0, 1);
      if (p.type === 'text') {
        ctx.save();
        ctx.font = 'bold 14px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = p.color;
        ctx.shadowColor = 'rgba(0,0,0,.9)';
        ctx.shadowBlur = 4;
        ctx.fillText(p.text, p.x, p.y);
        ctx.restore();
      } else if (p.type === 'smoke') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 + t * 2.4), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'coin') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2);
        ctx.restore();
      } else if (p.type === 'ember') {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - t * 0.4), 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
    for (const s of this.shockwaves) {
      const t = s.life / s.maxLife;
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width * (1 - t * 0.6);
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
