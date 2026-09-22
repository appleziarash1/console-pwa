import { clamp, lerp } from '../engine/utils.js';
import { SOLID } from '../world/worldBuilder.js';

/**
 * Canvas renderer. Everything is drawn procedurally — buildings, characters, effects,
 * particles, hazards and the lighting pass — so there are no image assets to load.
 */

const KIND_COLORS = {
  guard: { body: '#3a4a5c', trim: '#8fa4b8', skin: '#c9a186' },
  archer: { body: '#3d4a3a', trim: '#7fa06a', skin: '#c9a186' },
  heavy: { body: '#4a3a34', trim: '#a06a4a', skin: '#b8907a' },
  hunter: { body: '#2f2b3a', trim: '#8a6ad0', skin: '#c0a08a' },
  captain: { body: '#4a3a5c', trim: '#f0cf6b', skin: '#c9a186' },
  inquisitor: { body: '#2a2a34', trim: '#d94138', skin: '#cfc7b4' },
  assassinHunter: { body: '#1f1d26', trim: '#6fc3d6', skin: '#b8a894' },
  elite: { body: '#3a3a44', trim: '#e8e0cf', skin: '#c9a186' },
  civilianWorker: { body: '#6a5a44', trim: '#a89678', skin: '#b8907a' },
  civilianNoble: { body: '#5a4a60', trim: '#c9a227', skin: '#d0b096' },
};

export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game = game;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = 0; this.h = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.debug = false;
    this.time = 0;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.w = Math.max(320, Math.floor(rect.width));
    this.h = Math.max(240, Math.floor(rect.height));
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(this.dpr, this.dpr);
    this.game?.camera?.setViewport(this.w, this.h);
  }

  render(dt) {
    this.time += dt;
    const ctx = this.ctx;
    const cam = this.game.camera;
    const world = this.game.world;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Sky + parallax
    const env = this.environment(world);
    this.game.backdrop.draw(ctx, cam, env);

    if (!world.district || !world.active) { return; }

    // Resize backing store mapping: apply camera transform on the DPR-scaled context.
    ctx.setTransform(this.dpr * cam.zoom, 0, 0, this.dpr * cam.zoom,
      this.dpr * (-cam.x * cam.zoom + cam.offsetX), this.dpr * (-cam.y * cam.zoom + cam.offsetY));

    const view = cam.view;
    const inView = (x, y, pad = 120) =>
      x > view.x - pad && x < view.x + view.w + pad && y > view.y - pad * 3 && y < view.y + view.h + pad;

    this.drawDistrict(ctx, world, view, inView);
    this.drawSmokeAndFire(ctx, world);
    this.drawHazards(ctx, world);
    this.drawCollectibles(ctx, world);
    this.drawMissionMarkers(ctx, world);
    this.drawNPCs(ctx, world, view);
    this.drawEnemies(ctx, world, inView);
    if (world.boss && !world.boss.dead) this.drawBoss(ctx, world.boss);
    this.drawAllies(ctx, world);
    this.drawPlayer(ctx, world.player);
    this.drawProjectiles(ctx, world);
    this.drawParticles(ctx, world);
    this.drawBarks(ctx, world);
    if (this.debug) this.drawDebug(ctx, world, view);

    // Screen-space passes
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawLighting(ctx, world, cam);
    this.drawVisionCones(ctx, world, cam);
    if (this.game.slowmoAmount > 0) this.drawSlowmoOverlay(ctx);
    this.drawCrosshair(ctx);
  }

  environment(world) {
    const env = {
      night: world?.isNight ?? false,
      dusk: world?.timeOfDay === 'dusk',
      fog: world?.weather === 'fog' ? 0.35 : 0,
      tint: null,
      vignette: world?.isNight ? 0.55 : 0.32,
    };
    if (world?.weather === 'rain') env.tint = 'rgba(60,80,110,.10)';
    if (world?.weather === 'storm') env.tint = 'rgba(40,50,80,.16)';
    if (world?.alertLevel >= 3) env.tint = 'rgba(160,40,30,.06)';
    return env;
  }

  // ───────────────────────── district geometry ─────────────────────────
  drawDistrict(ctx, world, view, inView) {
    const d = world.district;
    const pal = d.palette;

    // Underground backdrop tint
    if (d.def.underground) { ctx.fillStyle = 'rgba(8,7,12,.82)'; ctx.fillRect(view.x - 40, view.y - view.h, view.w + 80, view.h * 3); }

    for (const s of d.collision) {
      if (!inView(s.x + s.w / 2, s.y + s.h / 2, 200)) continue;
      switch (s.type) {
        case SOLID.GROUND: {
          const g = ctx.createLinearGradient(0, s.y, 0, s.y + s.h);
          g.addColorStop(0, pal.ground); g.addColorStop(1, pal.groundAlt);
          ctx.fillStyle = g;
          ctx.fillRect(s.x, s.y, s.w, s.h);
          ctx.fillStyle = 'rgba(255,255,255,.06)';
          ctx.fillRect(s.x, s.y, s.w, 2);
          break;
        }
        case SOLID.BUILDING: {
          const g = ctx.createLinearGradient(s.x, s.y, s.x + s.w, s.y + s.h);
          g.addColorStop(0, pal.wall); g.addColorStop(1, pal.wallAlt);
          ctx.fillStyle = g;
          ctx.fillRect(s.x, s.y, s.w, s.h);
          // windows
          const floors = Math.max(1, Math.round(s.h / 96));
          ctx.fillStyle = world.isNight ? 'rgba(240,207,107,.30)' : 'rgba(150,170,190,.20)';
          for (let f = 0; f < floors; f++) {
            const wy = s.y + 30 + f * 90;
            if (wy + 34 > s.y + s.h) break;
            for (let wx = s.x + 16; wx < s.x + s.w - 30; wx += 54) {
              ctx.fillRect(wx, wy, 28, 34);
            }
          }
          // roof cap
          ctx.fillStyle = pal.roof;
          ctx.fillRect(s.x - 6, s.y - 8, s.w + 12, 10);
          ctx.fillStyle = 'rgba(0,0,0,.28)';
          ctx.fillRect(s.x, s.y + s.h - 6, s.w, 6);
          break;
        }
        case SOLID.PLATFORM: {
          ctx.fillStyle = pal.roof;
          ctx.fillRect(s.x, s.y, s.w, s.h);
          ctx.fillStyle = 'rgba(0,0,0,.35)';
          ctx.fillRect(s.x, s.y + s.h - 3, s.w, 3);
          // brackets
          ctx.strokeStyle = 'rgba(20,18,24,.5)'; ctx.lineWidth = 2;
          for (let bx = s.x + 8; bx < s.x + s.w - 8; bx += 26) {
            ctx.beginPath(); ctx.moveTo(bx, s.y + s.h); ctx.lineTo(bx + 5, s.y + s.h + 9); ctx.stroke();
          }
          break;
        }
        case SOLID.EARTH:
        case SOLID.BEDROCK: {
          ctx.fillStyle = s.type === SOLID.BEDROCK ? '#141218' : pal.wallAlt;
          ctx.fillRect(s.x, s.y, s.w, s.h);
          ctx.fillStyle = 'rgba(0,0,0,.22)';
          for (let i = 0; i < s.w; i += 40) ctx.fillRect(s.x + i, s.y + ((i * 7) % 23), 18, 5);
          break;
        }
        default: {
          ctx.fillStyle = pal.wallAlt;
          ctx.fillRect(s.x, s.y, s.w, s.h);
        }
      }
    }

    // Ladders
    ctx.strokeStyle = 'rgba(200,180,140,.6)'; ctx.lineWidth = 3;
    for (const l of d.ladders) {
      if (!inView(l.x + l.w / 2, l.y + l.h / 2, 120)) continue;
      ctx.beginPath(); ctx.moveTo(l.x + 2, l.y); ctx.lineTo(l.x + 2, l.y + l.h);
      ctx.moveTo(l.x + l.w - 2, l.y); ctx.lineTo(l.x + l.w - 2, l.y + l.h); ctx.stroke();
      ctx.lineWidth = 2;
      for (let y = l.y; y < l.y + l.h; y += 16) {
        ctx.beginPath(); ctx.moveTo(l.x + 1, y); ctx.lineTo(l.x + l.w - 1, y); ctx.stroke();
      }
      ctx.lineWidth = 3;
    }
    // Trellises
    for (const t of d.trellises) {
      if (!inView(t.x, t.y + t.h / 2, 120)) continue;
      ctx.fillStyle = 'rgba(70,90,60,.55)';
      ctx.fillRect(t.x, t.y, t.w, t.h);
      ctx.strokeStyle = 'rgba(120,150,100,.5)'; ctx.lineWidth = 1.5;
      for (let y = t.y; y < t.y + t.h; y += 14) {
        ctx.beginPath(); ctx.moveTo(t.x, y); ctx.lineTo(t.x + t.w, y + 7); ctx.stroke();
      }
    }
    // Ropes
    for (const r of d.ropes) {
      if (!inView(r.x, r.y + r.h / 2, 120)) continue;
      ctx.strokeStyle = r.swing ? 'rgba(190,170,120,.85)' : 'rgba(170,150,110,.7)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(r.x + r.w / 2, r.y);
      if (r.swing) {
        ctx.quadraticCurveTo(r.x + r.w / 2 + 14, r.y + r.h / 2, r.x + r.w / 2, r.y + r.h);
      } else {
        ctx.lineTo(r.x + r.w / 2, r.y + r.h);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(200,180,140,.8)';
      ctx.beginPath(); ctx.arc(r.x + r.w / 2, r.y + r.h, 4, 0, Math.PI * 2); ctx.fill();
    }
    // Ziplines
    for (const z of d.ziplines) {
      if (!inView((z.x1 + z.x2) / 2, (z.y1 + z.y2) / 2, 200)) continue;
      ctx.strokeStyle = 'rgba(200,190,170,.75)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(z.x1, z.y1); ctx.lineTo(z.x2, z.y2); ctx.stroke();
    }
    // Hide spots
    for (const h of d.hideSpots) {
      if (!inView(h.x + h.w / 2, h.y + h.h / 2, 100)) continue;
      if (h.kind === 'grass') {
        ctx.fillStyle = 'rgba(74,104,58,.85)';
        ctx.fillRect(h.x, h.y, h.w, h.h);
        ctx.strokeStyle = 'rgba(110,150,80,.7)'; ctx.lineWidth = 1.5;
        for (let x = h.x + 4; x < h.x + h.w; x += 8) {
          ctx.beginPath(); ctx.moveTo(x, h.y + h.h); ctx.lineTo(x + 3, h.y + 4); ctx.stroke();
        }
      } else if (h.kind === 'cart') {
        ctx.fillStyle = '#6a5638'; ctx.fillRect(h.x, h.y + 20, h.w, h.h - 20);
        ctx.fillStyle = '#9c8a4a'; ctx.fillRect(h.x - 4, h.y, h.w + 8, 24);
        ctx.fillStyle = '#3a3028';
        ctx.beginPath(); ctx.arc(h.x + 12, h.y + h.h, 8, 0, Math.PI * 2); ctx.arc(h.x + h.w - 12, h.y + h.h, 8, 0, Math.PI * 2); ctx.fill();
      } else if (h.kind === 'shadow') {
        ctx.fillStyle = 'rgba(0,0,0,.5)';
        ctx.fillRect(h.x, h.y, h.w, h.h);
        ctx.fillStyle = 'rgba(10,8,16,.4)';
        ctx.fillRect(h.x + 6, h.y + 6, h.w - 12, h.h - 12);
      } else if (h.kind === 'rooftop') {
        ctx.fillStyle = 'rgba(40,36,30,.85)'; ctx.fillRect(h.x, h.y, h.w, h.h);
        ctx.fillStyle = 'rgba(120,100,70,.4)'; ctx.fillRect(h.x + 4, h.y + 4, h.w - 8, h.h - 12);
      }
    }
    // Awnings
    for (const a of d.awning) {
      if (!inView(a.x + a.w / 2, a.y, 100)) continue;
      ctx.fillStyle = 'rgba(150,50,45,.72)';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + a.w, a.y);
      ctx.lineTo(a.x + a.w - 8, a.y + 14); ctx.lineTo(a.x + 8, a.y + 14);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(240,220,190,.14)';
      for (let sx = a.x; sx < a.x + a.w; sx += 18) ctx.fillRect(sx, a.y, 9, 14);
    }
    // Decor
    for (const dec of d.decor) {
      if (!inView(dec.x, dec.y, 100)) continue;
      switch (dec.type) {
        case 'lamp':
          ctx.fillStyle = '#2b2731'; ctx.fillRect(dec.x, dec.y - dec.h, 5, dec.h);
          ctx.fillStyle = 'rgba(240,207,107,.9)';
          ctx.beginPath(); ctx.arc(dec.x + 2, dec.y - dec.h - 6, 7, 0, Math.PI * 2); ctx.fill();
          break;
        case 'crate':
          ctx.fillStyle = '#6a5638'; ctx.fillRect(dec.x, dec.y - dec.h, dec.w, dec.h);
          ctx.strokeStyle = 'rgba(30,24,18,.6)'; ctx.lineWidth = 2;
          ctx.strokeRect(dec.x + 2, dec.y - dec.h + 2, dec.w - 4, dec.h - 4); break;
        case 'barrel':
          ctx.fillStyle = '#5a4a34';
          ctx.beginPath(); ctx.ellipse(dec.x, dec.y - dec.r, dec.r, dec.r * 1.3, 0, 0, Math.PI * 2); ctx.fill(); break;
        case 'tree':
          ctx.fillStyle = '#3a2f22'; ctx.fillRect(dec.x, dec.y - dec.h, 6, dec.h);
          ctx.fillStyle = world.isNight ? '#1e3018' : '#2f4a24';
          ctx.beginPath(); ctx.arc(dec.x + 3, dec.y - dec.h - 4, 26, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(dec.x - 12, dec.y - dec.h + 12, 18, 0, Math.PI * 2); ctx.fill(); break;
        case 'bush':
          ctx.fillStyle = world.isNight ? '#22351c' : '#33502a';
          ctx.beginPath(); ctx.ellipse(dec.x + dec.w / 2, dec.y - dec.h / 2, dec.w / 2, dec.h, 0, 0, Math.PI * 2); ctx.fill(); break;
        case 'haycart':
          ctx.fillStyle = '#5a4a2a'; ctx.fillRect(dec.x, dec.y - dec.h, dec.w, dec.h);
          ctx.fillStyle = '#9c8a4a';
          ctx.beginPath(); ctx.ellipse(dec.x + dec.w / 2, dec.y - dec.h - 4, dec.w / 2, 14, 0, 0, Math.PI * 2); ctx.fill(); break;
        case 'bench':
          ctx.fillStyle = '#4a3c2a'; ctx.fillRect(dec.x, dec.y - dec.h, dec.w, 6);
          ctx.fillRect(dec.x + 6, dec.y - dec.h, 4, dec.h); ctx.fillRect(dec.x + dec.w - 10, dec.y - dec.h, 4, dec.h); break;
        case 'fountain':
          ctx.fillStyle = '#5a5550'; ctx.fillRect(dec.x, dec.y - 12, dec.w, 12);
          ctx.fillStyle = 'rgba(90,140,160,.45)';
          ctx.beginPath(); ctx.ellipse(dec.x + dec.w / 2, dec.y - 14, dec.w / 2.4, 7, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#6a655e'; ctx.fillRect(dec.x + dec.w / 2 - 5, dec.y - 40, 10, 30); break;
        default: break;
      }
    }
    // Landmark buildings
    this.drawLandmarks(ctx, d, world, inView);

    // Towers
    for (const t of d.towers) {
      if (!inView(t.x + t.w / 2, t.y + t.h / 2, 200)) continue;
      ctx.fillStyle = t.disabled ? '#3a3730' : '#4a4238';
      ctx.fillRect(t.x, t.y, t.w, t.h);
      ctx.fillStyle = 'rgba(0,0,0,.28)';
      ctx.fillRect(t.x + 6, t.y, t.w - 12, t.h);
      ctx.fillStyle = t.disabled ? '#2a2731' : '#5a5044';
      ctx.fillRect(t.x - 10, t.y - 10, t.w + 20, 14);
      // Beacon
      const pulse = t.disabled ? 0.12 : 0.6 + Math.sin(this.time * 3.4 + t.index) * 0.4;
      ctx.fillStyle = t.disabled ? 'rgba(90,168,106,.5)' : `rgba(217,65,56,${pulse})`;
      ctx.beginPath(); ctx.arc(t.x + t.w / 2, t.beaconY, 9, 0, Math.PI * 2); ctx.fill();
      if (!t.disabled) {
        ctx.strokeStyle = `rgba(217,65,56,${pulse * 0.4})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(t.x + t.w / 2, t.beaconY, 22 + pulse * 8, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }

  drawLandmarks(ctx, d, world, inView) {
    const lm = d.landmarks;
    for (const shop of lm.shops) {
      if (!inView(shop.x, shop.y - 60)) continue;
      // Sign + stall
      ctx.fillStyle = '#3a3226'; ctx.fillRect(shop.x - 46, shop.y - 96, 92, 12);
      ctx.fillStyle = '#5a4a2a'; ctx.fillRect(shop.x - 44, shop.y - 62, 88, 62);
      ctx.fillStyle = '#c9a227';
      ctx.beginPath(); ctx.moveTo(shop.x - 46, shop.y - 96); ctx.lineTo(shop.x + 46, shop.y - 96);
      ctx.lineTo(shop.x + 40, shop.y - 120); ctx.lineTo(shop.x - 40, shop.y - 120); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(20,16,10,.85)'; ctx.font = 'bold 11px Inter, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(shop.kind.toUpperCase(), shop.x, shop.y - 104);
    }
    if (lm.safehouse) {
      const sh = lm.safehouse;
      if (inView(sh.x, sh.y - 60)) {
        ctx.fillStyle = 'rgba(63,124,140,.25)'; ctx.fillRect(sh.x - 56, sh.y - 130, 112, 130);
        ctx.strokeStyle = 'rgba(111,195,214,.7)'; ctx.lineWidth = 2;
        ctx.strokeRect(sh.x - 56, sh.y - 130, 112, 130);
        ctx.fillStyle = '#6fc3d6'; ctx.font = 'bold 12px Cinzel, serif'; ctx.textAlign = 'center';
        ctx.fillText('SAFEHOUSE', sh.x, sh.y - 140);
        // Hidden door
        ctx.fillStyle = 'rgba(10,8,14,.8)'; ctx.fillRect(sh.x - 18, sh.y - 62, 36, 62);
      }
    }
    if (lm.gallows && !lm.gallows.built) {
      const gx = lm.gallows.x;
      if (inView(gx, d.groundY - 120)) {
        ctx.strokeStyle = '#3a3028'; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(gx, d.groundY); ctx.lineTo(gx, d.groundY - 180);
        ctx.lineTo(gx + 70, d.groundY - 180); ctx.stroke();
        ctx.lineWidth = 3;
        for (let i = 0; i < 3; i++) {
          const rx = gx + 24 + i * 20;
          ctx.beginPath(); ctx.moveTo(rx, d.groundY - 180); ctx.lineTo(rx, d.groundY - 140); ctx.stroke();
          ctx.beginPath(); ctx.arc(rx, d.groundY - 132, 8, 0, Math.PI * 2); ctx.stroke();
        }
      }
    }
    if (lm.keep) {
      const k = lm.keep;
      if (inView(k.x + k.w / 2, k.y + k.h / 2, 300)) {
        ctx.fillStyle = '#443c34'; ctx.fillRect(k.x, k.y, k.w, k.h);
        ctx.fillStyle = '#52483c';
        for (let i = 0; i < k.w; i += 40) ctx.fillRect(k.x + i, k.y - 20, 26, 24);
        ctx.fillStyle = 'rgba(10,8,14,.75)';
        ctx.fillRect(k.x + k.w / 2 - 30, k.y + k.h - 100, 60, 100);
      }
    }
    if (lm.palace) {
      const p = lm.palace;
      if (inView(p.x + p.w / 2, p.y + p.h / 2, 300)) {
        ctx.fillStyle = '#6a6156'; ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.fillStyle = '#7d7368';
        for (let i = 0; i < p.w; i += 44) ctx.fillRect(p.x + i + 6, p.y - 30, 22, 34);
        ctx.fillStyle = 'rgba(240,207,107,.35)';
        for (let i = 0; i < 5; i++) ctx.fillRect(p.x + 24 + i * 50, p.y + 50, 26, 60);
      }
    }
    if (lm.belfry) {
      const b = lm.belfry;
      if (inView(b.x + b.w / 2, b.y + b.h / 2, 300)) {
        ctx.fillStyle = '#565061'; ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = '#6a5a70';
        ctx.beginPath(); ctx.moveTo(b.x - 14, b.y); ctx.lineTo(b.x + b.w + 14, b.y); ctx.lineTo(b.x + b.w / 2, b.y - 70); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(111,195,214,.5)';
        ctx.beginPath(); ctx.arc(b.x + b.w / 2, b.y + 90, 22, 0, Math.PI * 2); ctx.fill();
      }
    }
    // Exits
    for (const ex of d.landmarks.exits) {
      if (!inView(ex.x, ex.y + 60)) continue;
      ctx.fillStyle = 'rgba(201,162,39,.18)'; ctx.fillRect(ex.x, ex.y, ex.w, ex.h);
      ctx.strokeStyle = 'rgba(201,162,39,.6)'; ctx.lineWidth = 2; ctx.strokeRect(ex.x, ex.y, ex.w, ex.h);
      ctx.fillStyle = 'var(--gold)'; ctx.fillStyle = '#c9a227';
      ctx.font = 'bold 12px Cinzel, serif'; ctx.textAlign = 'center';
      ctx.fillText(ex.dir < 0 ? '◀' : '▶', ex.x + ex.w / 2, ex.y + ex.h / 2 + 6);
    }
    // Tunnel entrances
    for (const te of d.landmarks.tunnelEntrances || []) {
      if (!inView(te.x, te.y)) continue;
      ctx.fillStyle = 'rgba(8,6,12,.9)'; ctx.fillRect(te.x - 26, te.y - 6, 52, 12);
      ctx.strokeStyle = 'rgba(201,162,39,.4)'; ctx.lineWidth = 2;
      ctx.strokeRect(te.x - 26, te.y - 6, 52, 12);
      ctx.fillStyle = '#c9a227'; ctx.font = 'bold 10px Inter, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('▼', te.x, te.y + 4);
    }
  }

  drawSmokeAndFire(ctx, world) {
    for (const s of world.smokeClouds) {
      const a = clamp(s.life / s.maxLife, 0, 1);
      ctx.globalAlpha = 0.55 * a;
      for (let i = 0; i < 7; i++) {
        const ang = (i / 7) * Math.PI * 2 + this.time * 0.4;
        const rad = s.r * (0.4 + 0.3 * Math.sin(this.time * 1.3 + i));
        const g = ctx.createRadialGradient(s.x + Math.cos(ang) * rad, s.y + Math.sin(ang) * rad, 4, s.x, s.y, s.r);
        g.addColorStop(0, 'rgba(120,114,124,.9)');
        g.addColorStop(1, 'rgba(120,114,124,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(s.x + Math.cos(ang) * rad, s.y + Math.sin(ang) * rad, s.r * 0.8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    for (const f of world.fireZones) {
      const a = clamp(f.life / 5, 0, 1);
      ctx.globalAlpha = 0.35 * a;
      const g = ctx.createRadialGradient(f.x, f.y, 4, f.x, f.y, f.r);
      g.addColorStop(0, 'rgba(240,180,80,.9)');
      g.addColorStop(1, 'rgba(200,60,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  drawHazards(ctx, world) {
    for (const h of world.hazards) {
      ctx.save();
      if (h.kind === 'fire') {
        ctx.globalAlpha = clamp(h.life / 6, 0, 1);
        ctx.fillStyle = 'rgba(224,123,42,.75)';
        for (let i = -2; i <= 2; i++) {
          const fx = h.x + i * 20;
          const fh = 34 + Math.sin(this.time * 7 + i) * 12;
          ctx.beginPath();
          ctx.moveTo(fx - 9, h.y); ctx.lineTo(fx, h.y - fh); ctx.lineTo(fx + 9, h.y); ctx.closePath(); ctx.fill();
        }
      } else if (h.kind === 'bomb') {
        const blink = Math.sin(this.time * (16 - h.life * 3)) > 0;
        ctx.fillStyle = blink ? '#d94138' : '#2b2731';
        ctx.beginPath(); ctx.arc(h.x, h.y - 8, 9, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(240,207,107,.7)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(h.x, h.y - 8, 20 + (1 - h.life / 3.5) * 30, 0, Math.PI * 2); ctx.stroke();
      } else if (h.kind === 'trap') {
        ctx.globalAlpha = h.armed ? 0.8 : 0.3;
        ctx.strokeStyle = '#6fc3d6'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(h.x - 20, h.y); ctx.lineTo(h.x, h.y - 16); ctx.lineTo(h.x + 20, h.y); ctx.stroke();
        ctx.fillStyle = '#6fc3d6'; ctx.beginPath(); ctx.arc(h.x, h.y - 16, 3, 0, Math.PI * 2); ctx.fill();
      } else if (h.kind === 'rift') {
        ctx.globalAlpha = clamp(h.life / 8, 0, 1);
        ctx.strokeStyle = '#9a6ad0'; ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(h.x, h.y);
        for (let i = 0; i < 6; i++) {
          ctx.lineTo(h.x + Math.sin(this.time * 4 + i) * h.r * 0.8, h.y - 30 - i * 18);
        }
        ctx.stroke();
      } else if (h.kind === 'slamWave') {
        ctx.globalAlpha = clamp(h.life, 0, 1);
        ctx.fillStyle = 'rgba(224,123,42,.6)';
        ctx.beginPath(); ctx.ellipse(h.x, h.y, 40, 18, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }

  drawCollectibles(ctx, world) {
    for (const c of world.district.collectibles) {
      if (c.taken) continue;
      const bob = Math.sin(this.time * 2.4 + c.x * 0.01) * 5;
      const info = COLLECTIBLE_INFO[c.type] || { icon: '◆', color: '#f0cf6b' };
      ctx.save();
      ctx.globalAlpha = 0.85;
      const g = ctx.createRadialGradient(c.x, c.y + bob, 2, c.x, c.y + bob, 26);
      g.addColorStop(0, info.color); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(c.x, c.y + bob, 26, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = info.color;
      ctx.font = 'bold 16px Inter, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(info.icon, c.x, c.y + bob + 6);
      ctx.restore();
    }
  }

  drawMissionMarkers(ctx, world) {
    if (!world.missionMarkers) return;
    for (const m of world.missionMarkers) {
      if (m.done) continue;
      const bob = Math.sin(this.time * 3 + m.x * 0.01) * 6;
      const col = m.kind === 'target' ? '#d94138' : '#f0cf6b';
      ctx.save();
      ctx.globalAlpha = 0.6;
      const g = ctx.createRadialGradient(m.x, m.y + bob, 3, m.x, m.y + bob, 34);
      g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(m.x, m.y + bob, 34, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(m.x, m.y + bob, 12, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = col;
      ctx.font = 'bold 13px Inter, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(m.kind === 'target' ? '☠' : '◇', m.x, m.y + bob + 5);
      ctx.restore();
    }
  }

  // ───────────────────────── characters ─────────────────────────
  drawNPCs(ctx, world, view) {
    for (const n of world.npcs) {
      if (n.dead) continue;
      if (n.centerX < view.x - 140 || n.centerX > view.x + view.w + 140) continue;
      this.drawHuman(ctx, n, { body: n.arch.palette.body, trim: n.arch.palette.trim, skin: '#c9a186' }, { label: n.arch.icon });
      if (n.interactable) {
        ctx.fillStyle = '#f0cf6b'; ctx.font = 'bold 12px Inter, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('!', n.centerX, n.y - 14);
      }
    }
    for (const c of world.civilians) {
      if (c.dead) continue;
      if (c.centerX < view.x - 140 || c.centerX > view.x + view.w + 140) continue;
      const pal = CIV_PALETTES[c.variant] || CIV_PALETTES.worker;
      this.drawHuman(ctx, c, pal, { small: c.variant === 'child', label: c.isRescue ? '🔓' : null, fear: c.fear });
    }
  }

  drawEnemies(ctx, world, inView) {
    for (const e of world.enemies) {
      if (e.dead) { config_dead(ctx, e, this.time); continue; }
      if (!inView(e.centerX, e.centerY, 160)) continue;
      const pal = KIND_COLORS[e.typeId] || KIND_COLORS.guard;
      this.drawHuman(ctx, e, pal, { label: e.isTarget ? '☠' : null, alerted: e.isAwareOfPlayer(), detection: e.detection });
      if (world.revealedUntil > this.game.time || e.detection > 30) {
        // awareness pip
        ctx.fillStyle = e.detection >= 100 ? '#d94138' : e.detection >= 50 ? '#e07b2a' : 'rgba(240,207,107,.8)';
        ctx.beginPath(); ctx.arc(e.centerX, e.y - 12, 3, 0, Math.PI * 2); ctx.fill();
      }
      // health bar if damaged
      if (e.hp < e.maxHp) {
        const w = e.w + 14;
        ctx.fillStyle = 'rgba(5,4,7,.7)'; ctx.fillRect(e.centerX - w / 2, e.y - 8, w, 4);
        ctx.fillStyle = '#d94138'; ctx.fillRect(e.centerX - w / 2, e.y - 8, w * clamp(e.hp / e.maxHp, 0, 1), 4);
      }
    }
  }

  drawBoss(ctx, b) {
    const pal = { body: '#2a2530', trim: b.def.id === 'seradin' ? '#f0cf6b' : '#d94138', skin: '#c0a08a' };
    const scale = b.h / 54;
    ctx.save();
    ctx.translate(b.centerX, b.y + b.h);
    ctx.scale(b.facing, 1);
    // Aura
    const aura = ctx.createRadialGradient(0, -b.h / 2, 8, 0, -b.h / 2, b.w * 2.4);
    aura.addColorStop(0, 'rgba(217,65,56,.22)');
    aura.addColorStop(1, 'rgba(217,65,56,0)');
    ctx.fillStyle = aura;
    ctx.beginPath(); ctx.arc(0, -b.h / 2, b.w * 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    this.drawHuman(ctx, { ...b, x: b.x, y: b.y, w: b.w, h: b.h, vx: b.vx, facing: b.facing, grounded: b.grounded, animTime: b.animTime, attackTime: b.attackTime, attackDuration: b.attackDuration, hitFlash: b.hitFlash, state: b.state }, pal, { boss: true });
    // Phase indicator
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 11px Cinzel, serif';
    ctx.fillStyle = 'rgba(240,207,107,.85)';
    ctx.fillText(b.phase.name, b.centerX, b.y - 26);
    ctx.restore();
  }

  drawAllies(ctx, world) {
    for (const a of world.allies) {
      if (a.dead) continue;
      this.drawHuman(ctx, a, { body: '#3a3a44', trim: a.cls.color, skin: '#c9a186' }, { label: a.cls.icon });
      const w = a.w + 10;
      ctx.fillStyle = 'rgba(5,4,7,.7)'; ctx.fillRect(a.centerX - w / 2, a.y - 8, w, 3);
      ctx.fillStyle = a.cls.color;
      ctx.fillRect(a.centerX - w / 2, a.y - 8, w * clamp(a.hp / a.maxHp, 0, 1), 3);
    }
  }

  drawPlayer(ctx, p) {
    // Hidden shimmer
    if (p.hidden) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      this.drawHuman(ctx, p, { body: 'rgba(90,84,96,.6)', trim: '#6fc3d6', skin: '#c9a186' }, { player: true });
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = '#6fc3d6'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(p.centerX, p.centerY, 26 + Math.sin(this.time * 4) * 3, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      return;
    }
    const pal = { body: '#2f2b3a', trim: '#c9a227', skin: '#c9a186' };
    this.drawHuman(ctx, p, pal, {
      player: true, detection: p.detection, blocking: p.blocking, parry: p.parryWindow > 0,
      attacking: p.attacking, weapon: p.weaponId,
    });
    // Aim indicator
    if (p.aiming) {
      ctx.strokeStyle = 'rgba(240,207,107,.5)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(p.centerX, p.centerY); ctx.lineTo(p.centerX + p.facing * 420, p.centerY - 20); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  drawProjectiles(ctx, world) {
    for (const pr of world.projectiles) {
      ctx.save();
      ctx.translate(pr.x, pr.y);
      ctx.rotate(pr.rot);
      if (pr.isBomb) {
        ctx.fillStyle = '#2b2731';
        ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = Math.sin(this.time * 20) > 0 ? '#e07b2a' : '#5a4a34';
        ctx.beginPath(); ctx.arc(0, -6, 2.5, 0, Math.PI * 2); ctx.fill();
      } else if (pr.type === 'throwingKnife') {
        ctx.fillStyle = '#cfc7b4'; ctx.fillRect(-8, -1.5, 16, 3);
        ctx.fillStyle = '#f0cf6b'; ctx.fillRect(-8, -3, 5, 6);
      } else {
        ctx.fillStyle = '#8a7a5a'; ctx.fillRect(-12, -1.5, 24, 3);
        ctx.fillStyle = '#cfc7b4';
        ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(2, -3.5); ctx.lineTo(2, 3.5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#9c4450'; ctx.fillRect(-13, -4, 4, 8);
      }
      ctx.restore();
    }
  }

  drawParticles(ctx, world) {
    this.game.particles.draw(ctx);
  }

  drawBarks(ctx, world) {
    ctx.textAlign = 'center';
    for (const b of world.barks) {
      const a = clamp(b.life / b.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = '11px Inter, sans-serif';
      const w = ctx.measureText(b.text).width + 14;
      ctx.fillStyle = 'rgba(5,4,7,.7)';
      ctx.fillRect(b.x - w / 2, b.y - 14, w, 18);
      ctx.fillStyle = '#e8e0cf';
      ctx.fillText(b.text, b.x, b.y - 1);
      ctx.globalAlpha = 1;
    }
  }

  /** Procedural stick-and-block character renderer. */
  drawHuman(ctx, ent, pal, opts = {}) {
    const scale = opts.boss ? 1 : (opts.small ? 0.78 : 1);
    const w = ent.w * scale, h = ent.h * scale;
    const x = ent.centerX, y = ent.y + ent.h;
    const t = ent.animTime || this.time;
    const moving = Math.abs(ent.vx || 0) > 24;
    const airborne = ent.grounded === false;
    const attacking = (ent.attackTime || 0) > 0;
    const cycle = t * (moving ? 9 : 2.2);
    const bob = moving ? Math.abs(Math.sin(cycle)) * 2.4 : Math.sin(cycle) * 0.8;
    const legSwing = moving ? Math.sin(cycle) * (h * 0.16) : 0;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(ent.facing || 1, 1);
    if (ent.hitFlash > 0) { ctx.globalAlpha = 1; }
    const bodyCol = ent.hitFlash > 0 ? '#ffffff' : pal.body;
    const trimCol = pal.trim;

    // Shadow
    ctx.save();
    ctx.scale(1, 1);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(0, 0, w * 0.7, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    const hipY = -h * 0.42 - bob;
    const shoulderY = -h * 0.78 - bob;

    // Legs
    ctx.strokeStyle = bodyCol; ctx.lineWidth = Math.max(4, w * 0.20); ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, hipY);
    ctx.lineTo(legSwing, 0);
    ctx.moveTo(0, hipY);
    ctx.lineTo(-legSwing, 0);
    ctx.stroke();
    if (airborne) {
      ctx.beginPath(); ctx.moveTo(0, hipY); ctx.lineTo(w * 0.3, -h * 0.2); ctx.moveTo(0, hipY); ctx.lineTo(-w * 0.2, -h * 0.15); ctx.stroke();
    }

    // Torso
    ctx.fillStyle = bodyCol;
    ctx.beginPath();
    ctx.moveTo(-w * 0.36, shoulderY);
    ctx.lineTo(w * 0.36, shoulderY);
    ctx.lineTo(w * 0.28, hipY + 2);
    ctx.lineTo(-w * 0.28, hipY + 2);
    ctx.closePath(); ctx.fill();
    // Trim / coat
    ctx.fillStyle = trimCol;
    ctx.fillRect(-w * 0.36, shoulderY, w * 0.72, 4);
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    ctx.fillRect(-w * 0.06, shoulderY, w * 0.12, hipY - shoulderY);
    // Hood
    ctx.fillStyle = trimCol;
    ctx.beginPath();
    ctx.moveTo(-w * 0.34, shoulderY);
    ctx.lineTo(0, shoulderY - h * 0.16);
    ctx.lineTo(w * 0.34, shoulderY);
    ctx.closePath(); ctx.fill();

    // Head
    const headY = shoulderY - h * 0.14;
    ctx.fillStyle = pal.skin || '#c9a186';
    ctx.beginPath(); ctx.arc(0, headY, w * 0.24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = bodyCol;
    ctx.beginPath();
    ctx.arc(0, headY - w * 0.04, w * 0.26, Math.PI, Math.PI * 2);
    ctx.fill();
    // Eye
    ctx.fillStyle = opts.alerted ? '#d94138' : '#1a1620';
    ctx.beginPath(); ctx.arc(w * 0.1, headY, 1.8, 0, Math.PI * 2); ctx.fill();

    // Arms / weapon
    const armY = shoulderY + 4;
    const sh = ent.state || '';
    if (attacking) {
      const prog = ent.attackDuration ? 1 - ent.attackTime / ent.attackDuration : 0.5;
      const swing = Math.sin(clamp(prog, 0, 1) * Math.PI) * 1.3;
      ctx.strokeStyle = pal.skin || '#c9a186'; ctx.lineWidth = Math.max(3, w * 0.16);
      ctx.beginPath(); ctx.moveTo(0, armY); ctx.lineTo(w * 0.5, armY + swing * 16 - 6); ctx.stroke();
      // blade
      ctx.strokeStyle = '#e6e0d0'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(w * 0.5, armY + swing * 16 - 6);
      ctx.lineTo(w * 0.5 + 30 + swing * 14, armY + swing * 22 - 10);
      ctx.stroke();
    } else if (opts.blocking) {
      ctx.strokeStyle = pal.skin || '#c9a186'; ctx.lineWidth = Math.max(3, w * 0.16);
      ctx.beginPath(); ctx.moveTo(0, armY); ctx.lineTo(w * 0.36, armY - 4); ctx.stroke();
      ctx.strokeStyle = opts.parry ? '#f0cf6b' : '#cfc7b4'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(w * 0.4, armY - 16); ctx.lineTo(w * 0.4, armY + 16); ctx.stroke();
    } else if (sh === 'climb') {
      const cp = Math.sin(t * 8) * 10;
      ctx.strokeStyle = pal.skin || '#c9a186'; ctx.lineWidth = Math.max(3, w * 0.16);
      ctx.beginPath();
      ctx.moveTo(0, armY); ctx.lineTo(-w * 0.36, armY - 14 - cp);
      ctx.moveTo(0, armY); ctx.lineTo(w * 0.36, armY - 14 + cp);
      ctx.stroke();
    } else if (sh === 'zipline' || sh === 'rope') {
      ctx.strokeStyle = pal.skin || '#c9a186'; ctx.lineWidth = Math.max(3, w * 0.16);
      ctx.beginPath(); ctx.moveTo(0, armY); ctx.lineTo(0, armY - h * 0.3); ctx.stroke();
    } else {
      ctx.strokeStyle = pal.skin || '#c9a186'; ctx.lineWidth = Math.max(3, w * 0.16);
      const armSwing = moving ? Math.sin(cycle + Math.PI) * (h * 0.11) : 0;
      ctx.beginPath();
      ctx.moveTo(0, armY); ctx.lineTo(w * 0.3, armY + h * 0.16 + armSwing);
      ctx.moveTo(0, armY); ctx.lineTo(-w * 0.3, armY + h * 0.16 - armSwing);
      ctx.stroke();
      // sheathed weapon hint
      if (opts.player || opts.weapon) {
        ctx.strokeStyle = 'rgba(220,214,200,.5)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-w * 0.2, armY + 6); ctx.lineTo(-w * 0.1, armY + 26); ctx.stroke();
      }
    }

    // Damage flash overlay
    if (ent.hitFlash > 0) {
      ctx.globalAlpha = clamp(ent.hitFlash * 5, 0, 0.75);
      ctx.fillStyle = '#ff6a5a';
      ctx.fillRect(-w * 0.36, shoulderY, w * 0.72, hipY - shoulderY + 6);
      ctx.globalAlpha = 1;
    }

    // Interact / role label above head
    if (opts.label) {
      ctx.save();
      ctx.scale(ent.facing || 1, 1);
      ctx.font = '12px Inter, sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(240,207,107,.9)';
      ctx.fillText(opts.label, 0, shoulderY - h * 0.24);
      ctx.restore();
    }
    ctx.restore();

    // Fear indicator for civilians
    if (opts.fear > 0.5) {
      ctx.fillStyle = '#e07b2a'; ctx.font = 'bold 13px Inter, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('!', ent.centerX, ent.y - 12);
    }
  }

  // ───────────────────────── screen-space passes ─────────────────────────
  drawLighting(ctx, world, cam) {
    if (!world.isNight && world.weather !== 'storm') return;
    const dark = world.isNight ? 0.42 : 0.12;
    // Darkness with light cut-outs around lamps/torches/player.
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgba(40,44,70,${1 - dark * 0.4})`;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const lights = [...world.district.lights];
    for (const l of lights) {
      const s = cam.worldToScreen(l.x, l.y);
      const g = ctx.createRadialGradient(s.x, s.y, 4, s.x, s.y, l.r * cam.zoom);
      g.addColorStop(0, 'rgba(240,207,107,.16)');
      g.addColorStop(1, 'rgba(240,207,107,0)');
      ctx.fillStyle = g;
      ctx.fillRect(s.x - l.r * cam.zoom, s.y - l.r * cam.zoom, l.r * cam.zoom * 2, l.r * cam.zoom * 2);
    }
    // Player torch-glint
    const ps = cam.worldToScreen(world.player.centerX, world.player.centerY);
    const pg = ctx.createRadialGradient(ps.x, ps.y, 4, ps.x, ps.y, 120 * cam.zoom);
    pg.addColorStop(0, 'rgba(200,220,255,.10)');
    pg.addColorStop(1, 'rgba(200,220,255,0)');
    ctx.fillStyle = pg;
    ctx.fillRect(ps.x - 120 * cam.zoom, ps.y - 120 * cam.zoom, 240 * cam.zoom, 240 * cam.zoom);
    ctx.restore();
  }

  drawVisionCones(ctx, world, cam) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const drawCone = (e) => {
      if (e.dead) return;
      const s = cam.worldToScreen(e.centerX, e.centerY);
      const range = e.type.visionRange * cam.zoom;
      if (s.x < -range || s.x > this.w + range) return;
      const angle = e.facing > 0 ? 0 : Math.PI;
      const half = (e.type.visionAngle / 2);
      const alert = e.detection >= 100;
      const col = alert ? '217,65,56' : e.detection > 40 ? '224,123,42' : '240,207,107';
      const a = alert ? 0.14 : 0.07 + (e.detection / 100) * 0.07;
      const g = ctx.createRadialGradient(s.x, s.y, 6, s.x, s.y, range);
      g.addColorStop(0, `rgba(${col},${a * 1.6})`);
      g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.arc(s.x, s.y, range, angle - half, angle + half);
      ctx.closePath();
      ctx.fill();
    };
    for (const e of world.enemies) drawCone(e);
    if (world.boss && !world.boss.dead) drawCone(world.boss);
    ctx.restore();
  }

  drawSlowmoOverlay(ctx) {
    const a = clamp(this.game.slowmoAmount, 0, 1) * 0.25;
    ctx.save();
    ctx.fillStyle = `rgba(10,10,30,${a})`;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.restore();
  }

  drawCrosshair(ctx) {
    const m = this.game.input.mouse;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#f0cf6b'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(m.x - 9, m.y); ctx.lineTo(m.x - 3, m.y);
    ctx.moveTo(m.x + 3, m.y); ctx.lineTo(m.x + 9, m.y);
    ctx.moveTo(m.x, m.y - 9); ctx.lineTo(m.x, m.y - 3);
    ctx.moveTo(m.x, m.y + 3); ctx.lineTo(m.x, m.y + 9);
    ctx.stroke();
    ctx.restore();
  }

  drawDebug(ctx, world, view) {
    ctx.strokeStyle = 'rgba(0,255,120,.5)'; ctx.lineWidth = 1;
    ctx.strokeRect(world.player.x, world.player.y, world.player.w, world.player.h);
    for (const s of world.district.collision) {
      if (s.x + s.w < view.x || s.x > view.x + view.w) continue;
      ctx.strokeStyle = s.type === SOLID.PLATFORM ? 'rgba(0,180,255,.5)' : 'rgba(255,80,80,.4)';
      ctx.strokeRect(s.x, s.y, s.w, s.h);
    }
    for (const e of world.enemies) {
      if (e.dead) continue;
      ctx.strokeStyle = 'rgba(255,255,0,.5)';
      ctx.strokeRect(e.x, e.y, e.w, e.h);
    }
    ctx.strokeStyle = 'rgba(255,120,255,.7)';
    for (const h of world.district.hideSpots) ctx.strokeRect(h.x, h.y, h.w, h.h);
  }
}

const CIV_PALETTES = {
  worker: { body: '#6a5a44', trim: '#a89678', skin: '#b8907a' },
  merchant: { body: '#7a5a30', trim: '#c9a227', skin: '#c9a186' },
  noble: { body: '#5a4a60', trim: '#c9a227', skin: '#d0b096' },
  child: { body: '#6a6a5a', trim: '#a8a890', skin: '#d0b096' },
  beggar: { body: '#4a4438', trim: '#7a7264', skin: '#a88a72' },
  courier: { body: '#3a4a5c', trim: '#8fa4b8', skin: '#c9a186' },
};

const COLLECTIBLE_INFO = {
  fragment: { icon: '◆', color: '#6fc3d6' },
  letter: { icon: '✉', color: '#e8e0cf' },
  ancientCoin: { icon: '⛁', color: '#f0cf6b' },
  document: { icon: '▤', color: '#c9a227' },
  symbol: { icon: '❖', color: '#d94138' },
  artifact: { icon: '☗', color: '#5aa86a' },
};

function config_dead(ctx, e, time) {
  if (e.deadTime > 8) return;
  const a = clamp(1 - e.deadTime / 8, 0, 1);
  ctx.save();
  ctx.globalAlpha = a * 0.8;
  ctx.fillStyle = '#6a2430';
  ctx.beginPath();
  ctx.ellipse(e.centerX, e.y + e.h - 4, e.w * 0.75, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = a * 0.5;
  ctx.fillStyle = '#3a2b2f';
  ctx.fillRect(e.x, e.y + e.h - 12, e.w, 10);
  ctx.restore();
}
