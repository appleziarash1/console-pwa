import { clamp } from '../engine/utils.js';
import { getWeapon } from '../data/weapons.js';
import { getGadget } from '../data/gadgets.js';
import { xpProgress } from '../systems/progression.js';

/** DOM HUD: health, stamina, xp, gear, detection, objectives, minimap, boss bar, toasts. */
export class HUD {
  constructor(game) {
    this.game = game;
    this.el = {
      hud: document.getElementById('hud'),
      hpFill: document.getElementById('hpFill'),
      hpLabel: document.getElementById('hpLabel'),
      stamFill: document.getElementById('stamFill'),
      xpFill: document.getElementById('xpFill'),
      xpLabel: document.getElementById('xpLabel'),
      wanted: document.getElementById('wantedChip'),
      weather: document.getElementById('weatherChip'),
      time: document.getElementById('timeChip'),
      district: document.getElementById('districtChip'),
      objTitle: document.getElementById('objTitle'),
      objList: document.getElementById('objList'),
      alertBanner: document.getElementById('alertBanner'),
      minimap: document.getElementById('minimap'),
      coin: document.getElementById('coinLabel'),
      token: document.getElementById('tokenLabel'),
      mat: document.getElementById('matLabel'),
      intel: document.getElementById('intelLabel'),
      weaponIcon: document.getElementById('weaponIcon'),
      weaponName: document.getElementById('weaponName'),
      weaponSub: document.getElementById('weaponSub'),
      gadgetIcon: document.getElementById('gadgetIcon'),
      gadgetName: document.getElementById('gadgetName'),
      gadgetCount: document.getElementById('gadgetCount'),
      detectState: document.getElementById('detectState'),
      detectFill: document.getElementById('detectFill'),
      combo: document.getElementById('comboReadout'),
      toastStack: document.getElementById('toastStack'),
      subtitle: document.getElementById('subtitle'),
      touch: document.getElementById('touchControls'),
    };
    this.mapCtx = this.el.minimap?.getContext('2d');
    this.bossBar = null;
    this._lastObjectiveSig = '';
    this.flashTimer = 0;
    this.bindTouchDetection();
  }

  show() { this.el.hud?.classList.remove('hidden'); }
  hide() { this.el.hud?.classList.add('hidden'); }

  bindTouchDetection() {
    const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    if (isTouch) this.el.touch?.classList.remove('hidden');
    window.addEventListener('touchstart', () => this.el.touch?.classList.remove('hidden'), { once: true, passive: true });
  }

  setObjective(mission, objectives, timeLeft) {
    if (!mission) {
      this.el.objTitle.textContent = 'Free roam — find a safehouse to pick a mission';
      this.el.objList.innerHTML = '';
      return;
    }
    const sig = mission.id + objectives.map((o) => (o.done ? '1' : '0')).join('') + Math.floor(timeLeft || 0);
    if (sig === this._lastObjectiveSig) return;
    this._lastObjectiveSig = sig;
    this.el.objTitle.textContent = mission.name + (timeLeft > 0 ? `  ·  ${formatTime(timeLeft)}` : '');
    this.el.objList.innerHTML = objectives.map((o) => {
      const cls = [o.done ? 'done' : '', o.optional ? 'optional' : ''].filter(Boolean).join(' ');
      return `<li class="${cls}">${escapeHtml(o.text)}</li>`;
    }).join('');
  }

  setAlert(level) {
    this.el.alertBanner.textContent = level >= 4 ? 'LOCKDOWN' : level >= 3 ? 'COMBAT' : level >= 2 ? 'SEARCHING' : level >= 1 ? 'SUSPICIOUS' : '';
    this.el.alertBanner.classList.toggle('on', level >= 1);
    this.el.hud?.style.setProperty('--alert', level);
  }

  alertBanner(on) { if (!on) this.el.alertBanner.classList.remove('on'); }

  setBoss(boss) {
    this.bossBar = boss ? { boss } : null;
  }

  setXp() {
    const save = this.game.save;
    const p = xpProgress(save.xp);
    this.el.xpFill.style.transform = `scaleX(${p.frac})`;
    this.el.xpLabel.textContent = `Lv ${p.level}`;
  }

  setCurrency() {
    const s = this.game.save;
    this.el.coin.textContent = `⛁ ${s.coins}`;
    this.el.token.textContent = `✦ ${s.tokens}`;
    this.el.mat.textContent = `⚒ ${s.materials}`;
    this.el.intel.textContent = `◈ ${s.intel}`;
  }

  setGear() {
    const s = this.game.save;
    const w = getWeapon(s.currentWeapon);
    this.el.weaponIcon.textContent = w.icon;
    this.el.weaponName.textContent = w.name;
    this.el.weaponSub.textContent = `${w.type} · ${Math.round(w.damage)} dmg`;
    const g = getGadget(s.currentGadget);
    if (g) {
      this.el.gadgetIcon.textContent = g.icon;
      this.el.gadgetName.textContent = g.name;
      this.el.gadgetCount.textContent = `×${s.gadgets[g.id] || 0}`;
    }
  }

  setWanted(n) {
    this.el.wanted.textContent = `★ ${n}`;
    this.el.wanted.classList.toggle('wanted', n > 0);
  }

  setEnvironment(world) {
    this.el.weather.textContent = world.weather.charAt(0).toUpperCase() + world.weather.slice(1);
    this.el.time.textContent = world.isNight ? 'Night' : 'Day';
    this.el.district.textContent = this.game.world.district?.name || '';
  }

  toast(text, kind = '') {
    const d = document.createElement('div');
    d.className = `toast ${kind}`;
    d.textContent = text;
    this.el.toastStack.appendChild(d);
    setTimeout(() => d.remove(), 3200);
    while (this.el.toastStack.children.length > 5) this.el.toastStack.firstChild.remove();
  }

  subtitle(text, ms = 3200) {
    this.el.subtitle.textContent = text;
    this.el.subtitle.classList.remove('hidden');
    clearTimeout(this._subT);
    this._subT = setTimeout(() => this.el.subtitle.classList.add('hidden'), ms);
  }

  flashDamage() {
    this.flashTimer = 0.28;
    document.body.animate?.(
      [{ boxShadow: 'inset 0 0 120px rgba(217,65,56,0)' }, { boxShadow: 'inset 0 0 120px rgba(217,65,56,.55)' }, { boxShadow: 'inset 0 0 120px rgba(217,65,56,0)' }],
      { duration: 380 }
    );
  }

  update(dt) {
    const g = this.game;
    const p = g.world.player;
    if (!p) return;

    // Bars use scaleX for cheap animation.
    const hpFrac = clamp(p.hp / p.maxHp, 0, 1);
    this.el.hpFill.style.transform = `scaleX(${hpFrac})`;
    this.el.hpFill.style.width = '100%';
    this.el.hpLabel.textContent = `${Math.max(0, Math.ceil(p.hp))} / ${Math.round(p.maxHp)}`;
    this.el.stamFill.style.transform = `scaleX(${clamp(p.stamina / p.maxStamina, 0, 1)})`;

    if (this.el.hpFill.parentElement) {
      this.el.hpFill.parentElement.style.setProperty('--hp', hpFrac);
    }

    // Detection meter
    const st = g.stealth;
    this.el.detectFill.style.width = `${clamp(st.level, 0, 100)}%`;
    this.el.detectState.textContent = st.state.toUpperCase();
    this.el.detectState.className = `detect-label ${st.state}`;
    this.el.detectFill.style.background = st.state === 'combat' ? '#d94138'
      : st.state === 'alert' ? '#e07b2a'
      : st.state === 'searching' ? '#f0cf6b'
      : st.state === 'suspicious' ? '#c9a227' : '#6fc3d6';

    // Combo
    if (p.comboCount > 1 && p.comboTimer > 0) {
      this.el.combo.classList.remove('hidden');
      this.el.combo.textContent = `×${p.comboCount}`;
    } else this.el.combo.classList.add('hidden');

    this.drawMinimap();
    this.drawBossBar();
  }

  drawBossBar() {
    const img = this.el.hud;
    let bar = document.getElementById('bossBar');
    const boss = this.bossBar?.boss;
    if (!boss || boss.dead) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'bossBar';
      bar.innerHTML = '<div class="boss-name"></div><div class="boss-track"><div class="boss-fill"></div></div><div class="boss-phase"></div>';
      bar.style.cssText = `position:absolute;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 4.4rem);width:min(34rem,80vw);text-align:center;pointer-events:none;`;
      img.appendChild(bar);
    }
    bar.querySelector('.boss-name').textContent = boss.def.name.toUpperCase();
    bar.querySelector('.boss-name').style.cssText = 'font-family:var(--title-font);letter-spacing:.28rem;font-size:.76rem;color:var(--blood-bright);text-shadow:0 2px 8px #000;';
    bar.querySelector('.boss-track').style.cssText = 'height:.7rem;background:rgba(5,4,7,.75);border:1px solid rgba(217,65,56,.5);margin-top:.3rem;';
    const f = bar.querySelector('.boss-fill');
    f.style.cssText = `height:100%;background:linear-gradient(90deg,#5e1410,#d94138);width:${clamp(boss.hpFrac * 100, 0, 100)}%;transition:width .2s;`;
    bar.querySelector('.boss-phase').textContent = boss.phase?.name || '';
    bar.querySelector('.boss-phase').style.cssText = 'font-size:.62rem;letter-spacing:.18rem;color:var(--gold);margin-top:.2rem;';
  }

  drawMinimap() {
    const ctx = this.mapCtx;
    const d = this.game.world.district;
    const p = this.game.world.player;
    if (!ctx || !d) return;
    const W = this.el.minimap.width, H = this.el.minimap.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(5,4,7,.88)';
    ctx.fillRect(0, 0, W, H);

    const spanW = 1500;
    const scale = W / spanW;
    const camX = p.centerX;
    const camY = p.centerY;
    const toX = (wx) => (wx - camX) * scale + W / 2;
    const toY = (wy) => (wy - camY) * scale * 0.7 + H / 2;

    // Ground line
    ctx.strokeStyle = 'rgba(201,162,39,.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const gy = toY(d.groundY);
    ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();

    // Buildings as blocks
    ctx.fillStyle = 'rgba(120,110,130,.35)';
    for (const s of d.collision) {
      if (s.type !== 'building') continue;
      const x = toX(s.x);
      if (x < -40 || x > W + 40) continue;
      ctx.fillRect(x, toY(s.y), Math.max(1, s.w * scale), 5 + Math.max(0, gy - toY(s.y)));
    }

    const dot = (wx, wy, color, r = 3) => {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(toX(wx), toY(wy), r, 0, Math.PI * 2); ctx.fill();
    };
    // Towers
    for (const t of d.towers) dot(t.x + t.w / 2, t.beaconY, t.disabled ? '#5aa86a' : '#d94138', 4);
    // Shops / safehouse
    for (const s of d.landmarks.shops) dot(s.x, s.y - 50, '#c9a227', 3);
    if (d.landmarks.safehouse) dot(d.landmarks.safehouse.x, d.landmarks.safehouse.y - 50, '#6fc3d6', 4);
    // Exits
    for (const ex of d.landmarks.exits) dot(ex.x + 35, ex.y + 65, '#e8e0cf', 3);

    // Collectibles (only if intel purchased or tower revealed)
    const revealAll = this.game.save.intel > 0;
    for (const c of d.collectibles) {
      if (c.taken) continue;
      if (!revealAll && !d.towers.every((t) => t.disabled)) continue;
      dot(c.x, c.y, 'rgba(240,207,107,.55)', 2);
    }
    // Mission marker
    const marker = (this.game.world.missionMarkers || []).find((m) => !m.done);
    if (marker) dot(marker.x, marker.y, '#f0cf6b', 5);

    // Enemies
    for (const e of d ? this.game.world.enemies : []) {
      if (e.dead) continue;
      const aware = e.isAwareOfPlayer();
      dot(e.centerX, e.centerY, aware ? '#d94138' : 'rgba(200,120,110,.65)', 3);
    }
    if (this.game.world.boss && !this.game.world.boss.dead) dot(this.game.world.boss.centerX, this.game.world.boss.centerY, '#ff4a3a', 5);

    // Player
    dot(p.centerX, p.centerY, '#e8e0cf', 5);
    ctx.strokeStyle = '#e8e0cf'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(toX(p.centerX), toY(p.centerY), 7, 0, Math.PI * 2);
    ctx.stroke();

    // Frame
    ctx.strokeStyle = 'rgba(201,162,39,.4)'; ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);
    // Compass N
    ctx.fillStyle = 'rgba(201,162,39,.6)';
    ctx.font = 'bold 10px Inter, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('N', W / 2, 12);
  }
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${r}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
