import { clamp } from '../engine/utils.js';
import { WEAPONS, WEAPON_ORDER, getWeapon } from '../data/weapons.js';
import { ARMOR, ARMOR_ORDER, ARMOR_SETS, ARMOR_SLOTS } from '../data/armor.js';
import { GADGETS, GADGET_ORDER, getGadget } from '../data/gadgets.js';
import { TREES, findSkill } from '../data/skills.js';
import { ACHIEVEMENTS, CODEX, COLLECTIBLE_TYPES } from '../data/collectibles.js';
import { SHOPS, ALLY_CLASSES, RECRUIT_CANDIDATES } from '../data/npcs.js';
import { DISTRICT_ORDER, DISTRICTS } from '../data/districts.js';
import { MISSIONS } from '../data/missions.js';
import { getDialogue } from '../data/dialogue.js';
import { xpProgress } from '../systems/progression.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * All non-HUD screens: main menu, pause, map, gear, skills, quests, allies, codex,
 * shops, safehouse, dialogue, cutscenes, endings, options and save slots.
 */
export class Screens {
  constructor(game) {
    this.game = game;
    this.current = 'main';
    this.mapZoom = 1;
    this.bindEvents();
  }

  // ───────────────────────────── visibility plumbing ─────────────────────────────
  show(id) { $(id)?.classList.remove('hidden'); }
  hide(id) { $(id)?.classList.add('hidden'); }
  hideAll() {
    ['mainMenu', 'panelScreen', 'cutscene', 'dialogue', 'pauseMenu', 'gameMenus', 'shopScreen', 'safehouseScreen', 'endScreen'].forEach((i) => this.hide(i));
  }

  openMainMenu() {
    this.hideAll();
    this.show('mainMenu');
    const has = this.game.saves.newestSlot() !== null;
    $('btnContinue').disabled = !has;
    this.current = 'main';
  }

  openPause() {
    this.hideAll();
    this.show('pauseMenu');
    this.current = 'pause';
  }

  openMenus(tab = 'map') {
    this.hideAll();
    this.show('gameMenus');
    this.current = 'menus';
    this.selectTab(tab);
  }

  selectTab(tab) {
    const tabs = ['map', 'inventory', 'skills', 'quests', 'recruits', 'codex'];
    const labels = { map: 'MAP', inventory: 'GEAR', skills: 'SKILLS', quests: 'QUESTS', recruits: 'ALLIES', codex: 'CODEX' };
    $('bigMenuTitle').textContent = labels[tab] || 'MENU';
    for (const t of tabs) {
      $(`pane${capitalize(t)}`)?.classList.toggle('hidden', t !== tab);
      const btn = document.querySelector(`.big-menu-tabs button[data-tab="${t}"]`);
      btn?.classList.toggle('active', t === tab);
    }
    this.renderTab(tab);
  }

  renderTab(tab) {
    switch (tab) {
      case 'map': this.renderMap(); break;
      case 'inventory': this.renderInventory(); break;
      case 'skills': this.renderSkills(); break;
      case 'quests': this.renderQuests(); break;
      case 'recruits': this.renderRecruits(); break;
      case 'codex': this.renderCodex(); break;
      default: break;
    }
  }

  // ───────────────────────────── map ─────────────────────────────
  renderMap() {
    const save = this.game.save;
    const canvas = $('bigmap');
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#08070b';
    ctx.fillRect(0, 0, W, H);

    // District grid: 5 x 2
    const cols = 5, rows = 2;
    const pad = 26;
    const cw = (W - pad * (cols + 1)) / cols;
    const ch = (H - pad * (rows + 1)) / rows;
    const d = this.game.world.district;

    DISTRICT_ORDER.forEach((id, i) => {
      const def = DISTRICTS[id];
      const col = i % cols, row = Math.floor(i / cols);
      const x = pad + col * (cw + pad);
      const y = pad + row * (ch + pad);
      const control = save.districtControl?.[id] ?? (i === 0 ? 0.35 : 1);
      const current = d && d.id === id;

      ctx.fillStyle = control <= 0 ? 'rgba(90,168,106,.14)' : `rgba(158,43,37,${0.06 + control * 0.16})`;
      ctx.fillRect(x, y, cw, ch);
      ctx.strokeStyle = current ? '#f0cf6b' : control <= 0 ? 'rgba(90,168,106,.55)' : 'rgba(201,162,39,.3)';
      ctx.lineWidth = current ? 3 : 1.5;
      ctx.strokeRect(x, y, cw, ch);

      ctx.fillStyle = current ? '#f0cf6b' : '#e8e0cf';
      ctx.font = 'bold 13px Cinzel, serif'; ctx.textAlign = 'center';
      ctx.fillText(def.name.toUpperCase(), x + cw / 2, y + 24);

      ctx.fillStyle = 'rgba(168,159,140,.85)';
      ctx.font = '10px Inter, sans-serif';
      wrapText(ctx, def.blurb, x + cw / 2, y + 42, cw - 16, 12);

      // Control bar
      ctx.fillStyle = 'rgba(0,0,0,.4)';
      ctx.fillRect(x + 10, y + ch - 22, cw - 20, 8);
      ctx.fillStyle = control <= 0 ? '#5aa86a' : '#d94138';
      ctx.fillRect(x + 10, y + ch - 22, (cw - 20) * (1 - control), 8);
      ctx.fillStyle = control <= 0 ? '#5aa86a' : '#a89f8c';
      ctx.font = 'bold 9px Inter, sans-serif';
      ctx.fillText(control <= 0 ? 'LIBERATED' : `DOMINION ${Math.round(control * 100)}%`, x + cw / 2, y + ch - 26);

      // Landmark pips
      const missions = Object.values(MISSIONS).filter((m) => m.district === id && !m.secret);
      const done = missions.filter((m) => save.missionsCompleted.includes(m.id)).length;
      ctx.fillStyle = '#c9a227';
      ctx.font = '9px Inter, sans-serif';
      ctx.fillText(`missions ${done}/${missions.length}`, x + cw / 2, y + ch - 34);

      // Tower status
      const towers = (save.disabledTowers || []).filter((t) => t.startsWith(id)).length;
      ctx.fillStyle = towers > 0 ? '#5aa86a' : '#d94138';
      ctx.fillText(`towers ${towers}/${def.towers}`, x + cw / 2, y + ch - 46);

      if (current) {
        ctx.fillStyle = '#f0cf6b';
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.fillText('◆ YOU ARE HERE', x + cw / 2, y + ch - 58);
      }
      ctx.fillStyle = 'rgba(168,159,140,.6)';
      ctx.font = '9px Inter, sans-serif';
      ctx.fillText(control <= 0 ? 'safe streets' : def.watchtower ? 'watchtower active' : 'no watchtower', x + cw / 2, y + ch - 14);
    });

    // Legend
    $('mapLegend').innerHTML = [
      ['#f0cf6b', 'Current district'],
      ['#d94138', 'Dominion control'],
      ['#5aa86a', 'Liberated'],
      ['#c9a227', 'Missions'],
    ].map(([c, t]) => `<span><i class="legend-dot" style="background:${c}"></i>${t}</span>`).join('');
  }

  // ───────────────────────────── inventory / gear ─────────────────────────────
  renderInventory() {
    const save = this.game.save;
    const pane = $('paneInventory');
    const p = this.game.player;
    const stats = `
      <div class="section-title">CHARACTER</div>
      <div class="grid-cards">
        <div class="card">
          <h4>${esc(save.playerName)}</h4>
          <div class="card-sub">Level ${save.level} · ${xpProgress(save.xp).frac ? Math.floor(xpProgress(save.xp).frac * 100) : 0}% to next</div>
          <div class="card-stats">
            HP ${Math.round(p.maxHp)} · Stamina ${Math.round(p.maxStamina)}<br>
            Damage +${Math.round((p.mods.damage || 0) * 100)}% · Armor ${Math.round((p.mods.armor || 0) * 100)}%<br>
            Detection resist ${Math.round((p.mods.detectionResist || 0) * 100)}% · Move +${Math.round((p.mods.moveSpeed || 0) * 100)}%<br>
            Kills ${save.stats.kills || 0} · Assassinations ${save.stats.assassinations || 0}<br>
            Missions ${save.stats.missions || 0} · Districts freed ${save.stats.liberated || 0}
          </div>
        </div>
        <div class="card">
          <h4>SKILL POINTS</h4>
          <div class="card-sub">Unspent: <b>${save.skillPoints}</b></div>
          <div class="card-stats">Skills unlocked: ${save.skills.length}</div>
          <button data-respec="1">RESPEC (refund all)</button>
        </div>
      </div>
    `;

    const weapons = WEAPON_ORDER.map((id) => {
      const w = WEAPONS[id];
      const owned = save.weapons.includes(id);
      const equipped = save.currentWeapon === id;
      return `<div class="card ${owned ? (equipped ? 'equipped' : '') : 'locked'}">
        <h4>${w.icon} ${esc(w.name)} ${equipped ? '<span class="tag active">EQUIPPED</span>' : ''}</h4>
        <div class="card-sub">${esc(w.desc)}</div>
        <div class="card-stats">DMG ${w.damage} · Speed ${w.speed.toFixed(2)} · Reach ${w.reach}${w.ranged ? ' · RANGED' : ''}${w.silent ? ' · SILENT' : ''}</div>
        <button data-equip-weapon="${id}" ${owned ? '' : 'disabled'}>${owned ? 'EQUIP' : `LOCKED (${w.price}⛁)`}</button>
      </div>`;
    }).join('');

    const armor = ARMOR_SLOTS.map((slot) => ARMOR_ORDER[slot].map((id) => {
      const a = ARMOR[id];
      const owned = save.ownedArmor.includes(id);
      const equipped = save.loadout[slot] === id;
      return `<div class="card ${owned ? (equipped ? 'equipped' : '') : 'locked'}">
        <h4>${a.icon} ${esc(a.name)} ${equipped ? '<span class="tag active">WORN</span>' : ''}</h4>
        <div class="card-sub">${esc(a.desc)}</div>
        <div class="card-stats">${Object.entries(a.stats).map(([k, v]) => `${labelStat(k)} ${v > 0 ? '+' : ''}${Math.round(v * 100)}%`).join(' · ')}</div>
        <button data-equip-armor="${id}" ${owned ? '' : 'disabled'}>${owned ? 'EQUIP' : 'NOT OWNED'}</button>
      </div>`;
    }).join('')).join('');

    const gadgets = GADGET_ORDER.map((id) => {
      const g = GADGETS[id];
      const count = save.gadgets[id] || 0;
      return `<div class="card ${count > 0 ? '' : 'locked'} ${save.currentGadget === id ? 'equipped' : ''}">
        <h4>${g.icon} ${esc(g.name)}</h4>
        <div class="card-sub">${esc(g.desc)}</div>
        <div class="card-stats">Held ×${count} · max ×${g.maxCount} · cooldown ${g.cooldown}s</div>
        <button data-equip-gadget="${id}" ${count > 0 ? '' : 'disabled'}>EQUIP</button>
      </div>`;
    }).join('');

    const sets = Object.values(ARMOR_SETS).map((s) => {
      const complete = s.pieces.every((pc) => Object.values(save.loadout).includes(pc));
      const owned = s.pieces.filter((pc) => save.ownedArmor.includes(pc)).length;
      return `<div class="card ${complete ? 'equipped' : ''}">
        <h4>${esc(s.name)} ${complete ? '<span class="tag done">ACTIVE</span>' : ''}</h4>
        <div class="card-sub">${esc(s.desc)}</div>
        <div class="card-stats">Pieces owned ${owned}/${s.pieces.length}<br>${Object.entries(s.bonus).map(([k, v]) => `${labelStat(k)} +${Math.round(v * 100)}%`).join(' · ')}</div>
      </div>`;
    }).join('');

    pane.innerHTML = `
      ${stats}
      <div class="section-title">WEAPONS</div><div class="grid-cards">${weapons}</div>
      <div class="section-title">ARMOR</div><div class="grid-cards">${armor}</div>
      <div class="section-title">GADGETS</div><div class="grid-cards">${gadgets}</div>
      <div class="section-title">ARMOR SETS</div><div class="grid-cards">${sets}</div>
    `;
  }

  // ───────────────────────────── skills ─────────────────────────────
  renderSkills() {
    const save = this.game.save;
    const pane = $('paneSkills');
    const trees = TREES.map((tree) => {
      const nodes = tree.nodes.map((n) => {
        const owned = save.skills.includes(n.id);
        const can = this.game.progression.canUnlockSkill(n.id);
        const cls = owned ? 'owned' : can.ok ? '' : 'locked';
        return `<div class="skill-node ${cls}" data-skill="${n.id}" title="${esc(n.desc)}">
          <div class="skill-dot">${owned ? '✓' : ''}</div>
          <div><b>${esc(n.name)}</b> <small>${n.cost} SP — ${esc(n.desc)}${n.requires ? ` (needs ${esc(findSkill(n.requires)?.node.name || '')})` : ''}</small></div>
        </div>`;
      }).join('');
      return `<div class="skill-col"><h3>${tree.icon} ${tree.name}</h3>${nodes}</div>`;
    }).join('');
    pane.innerHTML = `
      <div class="stat-row"><span>Unspent skill points</span><b>${save.skillPoints}</b></div>
      <div class="skill-tree">${trees}</div>
      <p class="empty-note">Click a skill to unlock it. Requires its prerequisite and enough skill points.</p>
    `;
  }

  // ───────────────────────────── quests / missions ─────────────────────────────
  renderQuests() {
    const save = this.game.save;
    const pane = $('paneQuests');
    const active = this.game.missions.active;
    const avail = this.game.missions.availableMissions();
    const done = save.missionsCompleted;

    const activeHtml = active ? `
      <div class="quest-item">
        <h4>${esc(active.name)} <span class="tag active">ACTIVE</span></h4>
        <div class="q-meta">Act ${active.act} · ${esc(active.type)} · ${esc(DISTRICTS[active.district]?.name || '')}</div>
        <p>${esc(active.briefing)}</p>
        <ul>${this.game.missions.objectives.map((o) => `<li class="${o.done ? 'done' : ''}">${o.optional ? '[optional] ' : ''}${esc(o.text)}</li>`).join('')}</ul>
        <p class="empty-note">Routes — stealth: ${esc(active.routes?.stealth || '—')} · combat: ${esc(active.routes?.combat || '—')}</p>
      </div>` : '<p class="empty-note">No mission active. Visit a safehouse to select one.</p>';

    const availableHtml = avail.length ? avail.map((m) => `
      <div class="quest-item">
        <h4>${esc(m.name)}</h4>
        <div class="q-meta">Act ${m.act} · ${esc(DISTRICTS[m.district]?.name || '')} · ${esc(m.time)} / ${esc(m.weather)}</div>
        <p>${esc(m.briefing)}</p>
        <div class="q-meta">Reward: ${m.reward?.xp || 0} XP · ${m.reward?.coins || 0}⛁${m.reward?.tokens ? ` · ${m.reward.tokens}✦` : ''}</div>
        <button data-start-mission="${m.id}" ${this.game.missions.isActive ? 'disabled' : ''}>START MISSION</button>
      </div>`).join('') : '<p class="empty-note">All currently available missions complete.</p>';

    const doneHtml = done.length ? done.map((id) => {
      const m = MISSIONS[id];
      return m ? `<div class="quest-item"><h4>${esc(m.name)} <span class="tag done">DONE</span></h4><div class="q-meta">Act ${m.act}</div></div>` : '';
    }).join('') : '<p class="empty-note">Nothing completed yet.</p>';

    pane.innerHTML = `
      <div class="section-title">ACTIVE</div>${activeHtml}
      <div class="section-title">AVAILABLE</div>${availableHtml}
      <div class="section-title">COMPLETED (${done.length})</div>${doneHtml}
    `;
  }

  // ───────────────────────────── allies ─────────────────────────────
  renderRecruits() {
    const save = this.game.save;
    const pane = $('paneRecruits');
    const recruited = save.allies.map((a) => {
      const cls = ALLY_CLASSES[a.cls];
      const cand = RECRUIT_CANDIDATES.find((c) => c.id === a.id);
      const active = save.activeAllies.includes(a.id);
      const cost = 2 + a.level;
      return `<div class="card ${active ? 'equipped' : ''}">
        <h4>${cls.icon} ${esc(a.name)} <span class="tag active">Lv ${a.level}</span></h4>
        <div class="card-sub">${esc(cand?.blurb || cls.desc)}</div>
        <div class="card-stats">Class ${esc(cls.name)} · HP ${cls.hp[a.level - 1]} · DMG ${cls.damage[a.level - 1]} · DEF ${Math.round(cls.defense[a.level - 1] * 100)}%<br>Skill: ${esc(cls.skill)} — ${esc(cls.skillDesc)}</div>
        <button data-ally-level="${a.id}" ${a.level >= 5 ? 'disabled' : ''}>${a.level >= 5 ? 'ELITE' : `LEVEL UP (${cost}✦)`}</button>
        <button data-ally-toggle="${a.id}">${active ? 'DISMISS' : 'DEPLOY'}</button>
      </div>`;
    }).join('') || '<p class="empty-note">No allies recruited yet. Look for recruits at safehouses.</p>';

    const classes = Object.values(ALLY_CLASSES).map((c) => `
      <div class="card"><h4>${c.icon} ${esc(c.name)}</h4><div class="card-sub">${esc(c.desc)}</div>
      <div class="card-stats">Skill: ${esc(c.skill)} — ${esc(c.skillDesc)}<br>Levels: HP ${c.hp.join('/')}<br>DMG ${c.damage.join('/')}</div></div>`).join('');

    const maxSlots = 1 + (this.game.player.mods.allySlots || 0);
    pane.innerHTML = `
      <div class="stat-row"><span>Deployed allies</span><b>${save.activeAllies.length} / ${maxSlots}</b></div>
      <div class="section-title">YOUR ALLIES</div><div class="grid-cards">${recruited}</div>
      <div class="section-title">ALLY CLASSES</div><div class="grid-cards">${classes}</div>
    `;
  }

  // ───────────────────────────── codex ─────────────────────────────
  renderCodex() {
    const save = this.game.save;
    const pane = $('paneCodex');
    const entries = Object.entries(CODEX).map(([id, e]) => {
      const seen = save.codexSeen?.includes(id);
      return `<div class="codex-entry ${seen ? '' : 'locked'}">
        <h4>${esc(e.title)}</h4>
        <p>${seen ? esc(e.body) : 'Earn intel to unlock this entry.'}</p>
      </div>`;
    }).join('');
    const collectStats = Object.keys(COLLECTIBLE_TYPES).map((t) => {
      const key = COLLECTIBLE_TYPES[t];
      const found = (save.collectiblesFound || []).filter((c) => c.startsWith(t + ':')).length;
      return `<div class="stat-row"><span>${key.icon} ${esc(key.name)}</span><b>${found}</b></div>`;
    }).join('');
    const achs = ACHIEVEMENTS.map((a) => {
      const has = save.achievements.includes(a.id);
      return `<div class="ach ${has ? 'unlocked' : 'locked'}"><h4>${a.icon} ${esc(a.name)}</h4><p>${esc(a.desc)}</p></div>`;
    }).join('');
    pane.innerHTML = `
      <div class="section-title">LORE</div>${entries}
      <div class="section-title">COLLECTIBLES (${(save.collectiblesFound || []).length})</div>${collectStats}
      <div class="section-title">ACHIEVEMENTS (${save.achievements.length}/${ACHIEVEMENTS.length})</div>
      <div class="ach-grid">${achs}</div>
    `;
  }

  // ───────────────────────────── shops ─────────────────────────────
  openShop(shopId, npcName) {
    this.activeShop = shopId;
    this.hideAll();
    this.show('shopScreen');
    this.current = 'shop';
    $('shopTitle').textContent = (npcName || SHOPS[shopId]?.name || 'MERCHANT').toUpperCase();
    this.renderShop();
  }

  renderShop() {
    const shop = SHOPS[this.activeShop] || SHOPS.general;
    const save = this.game.save;
    $('shopWallet').textContent = shop.currency === 'tokens' ? `✦ ${save.tokens}` : `⛁ ${save.coins}`;
    const grid = $('shopGrid');
    grid.innerHTML = shop.stock.map((item) => {
      let name, desc, price, owned = false, disabled = false;
      if (item.kind === 'weapon') {
        const w = WEAPONS[item.id];
        name = `${w.icon} ${w.name}`; desc = w.desc; price = w.price;
        owned = save.weapons.includes(item.id);
      } else if (item.kind === 'armor') {
        const a = ARMOR[item.id];
        name = `${a.icon} ${a.name}`; desc = a.desc; price = a.price;
        owned = save.ownedArmor.includes(item.id);
      } else if (item.kind === 'gadget') {
        const g = GADGETS[item.id];
        name = `${g.icon} ${g.name}${item.count > 1 ? ` ×${item.count}` : ''}`; desc = g.desc;
        price = item.price ?? g.price * (item.count || 1);
        disabled = (save.gadgets[item.id] || 0) >= g.maxCount;
      } else {
        name = `${item.icon} ${item.name}`; desc = item.desc; price = item.price;
      }
      const canAfford = shop.currency === 'tokens' ? save.tokens >= price : save.coins >= price;
      return `<div class="shop-item">
        <h4>${esc(name)}${owned ? ' <span class="tag done">OWNED</span>' : ''}</h4>
        <p>${esc(desc || '')}</p>
        <div class="price">${price} ${shop.currency === 'tokens' ? '✦' : '⛁'}</div>
        <button data-buy-kind="${item.kind}" data-buy-id="${item.id}" data-buy-count="${item.count || 1}"
          ${owned || disabled || !canAfford ? 'disabled' : ''}>${owned ? 'OWNED' : disabled ? 'MAX' : 'BUY'}</button>
      </div>`;
    }).join('');
    $('shopFooter').textContent = shop.currency === 'tokens'
      ? 'Black tokens are earned from captains, bosses and optional objectives.'
      : 'Press ESC or close to leave. Bought gear is permanently owned.';
  }

  // ───────────────────────────── safehouse ─────────────────────────────
  openSafehouse() {
    this.hideAll();
    this.show('safehouseScreen');
    this.current = 'safehouse';
    this.renderSafehouse();
  }

  renderSafehouse() {
    const grid = $('safehouseGrid');
    const save = this.game.save;
    const avail = this.game.missions.availableMissions();
    const rows = [];
    rows.push(`<div class="shop-item"><h4>REST</h4><p>Restore all health and stamina. Free.</p><button data-safe="rest">REST</button></div>`);
    rows.push(`<div class="shop-item"><h4>SAVE GAME</h4><p>Write progress to a save slot.</p><button data-safe="save">SAVE</button></div>`);
    rows.push(`<div class="shop-item"><h4>RESPEC</h4><p>Refund every skill point for redistribution.</p><button data-safe="respec">RESPEC (${save.skills.length} skills)</button></div>`);
    rows.push(`<div class="shop-item"><h4>BLACK MARKET</h4><p>Spend black tokens on permanent boosts and skill points.</p><button data-safe="blackmarket">OPEN (✦ ${save.tokens})</button></div>`);
    for (const m of avail.slice(0, 8)) {
      rows.push(`<div class="shop-item"><h4>${esc(m.name)}</h4>
        <p>Act ${m.act} · ${esc(DISTRICTS[m.district]?.name || '')}<br>${esc(m.briefing).slice(0, 120)}…</p>
        <button data-start-mission="${m.id}" ${this.game.missions.isActive ? 'disabled' : ''}>START MISSION</button></div>`);
    }
    grid.innerHTML = rows.join('');
  }

  // ───────────────────────────── dialogue ─────────────────────────────
  /** Start a dialogue tree. Returns true if a dialogue opened. */
  startDialogue(idOrTree, onEnd) {
    const tree = typeof idOrTree === 'string' ? getDialogue(idOrTree) : idOrTree;
    if (!tree) return false;
    this.dialogue = { tree, nodeId: 'start', onEnd };
    this.hideAll();
    this.show('dialogue');
    this.current = 'dialogue';
    this.renderDialogueNode();
    return true;
  }

  renderDialogueNode() {
    const { tree, nodeId } = this.dialogue;
    const node = tree.nodes[nodeId];
    if (!node) { this.endDialogue(); return; }
    $('dlgSpeaker').textContent = node.speaker || '';
    $('dlgPortrait').textContent = node.portrait || node.speaker?.[0] || '?';
    $('dlgText').innerHTML = (node.lines || []).map((l) => `<div>${esc(l)}</div>`).join('');
    const choices = $('dlgChoices');
    choices.innerHTML = '';
    if (node.choices?.length) {
      node.choices.forEach((c, i) => {
        const b = document.createElement('button');
        b.textContent = `${i + 1}. ${c.text}`;
        b.addEventListener('click', () => this.pickChoice(c));
        choices.appendChild(b);
      });
      $('dlgHint').textContent = '[1-4] choose  ·  [SPACE] first option';
    } else {
      $('dlgHint').textContent = node.end ? '[SPACE] close' : '[SPACE] continue';
      const b = document.createElement('button');
      b.textContent = node.end ? '— end —' : '▸ continue';
      b.addEventListener('click', () => (node.end ? this.finishNode(node) : this.advanceNode(node)));
      choices.appendChild(b);
    }
  }

  pickChoice(choice) {
    const node = this.dialogue.tree.nodes[this.dialogue.nodeId];
    if (choice.effect) this.applyDialogueEffect(choice.effect);
    if (choice.setApproach) this.game.missionApproach = choice.setApproach;
    if (!choice.goto) { this.finishNode(node); return; }
    this.dialogue.nodeId = choice.goto;
    const next = this.dialogue.tree.nodes[choice.goto];
    this.applyNodeEffects(next);
    this.renderDialogueNode();
  }

  advanceNode(node) {
    this.applyNodeEffects(node);
    if (node.goto) { this.dialogue.nodeId = node.goto; this.renderDialogueNode(); }
    else this.finishNode(node);
  }

  applyNodeEffects(node) {
    if (!node) return;
    if (node.effect) this.applyDialogueEffect(node.effect);
    if (node.startBoss) this.game.pendingBossStart = node.startBoss;
  }

  applyDialogueEffect(effect) {
    const g = this.game;
    if (effect.intel) g.progression.addIntel(effect.intel);
    if (effect.coins) g.progression.addCoins(effect.coins);
    if (effect.xp) g.progression.addXp(effect.xp);
    if (effect.story) {
      g.save.storyFlags[effect.story] = true;
      if (g.save.storyFlags.fatherFounder) g.unlockCodex('caelVaren');
    }
    if (effect.relationship) g.toast(`Relationship +${effect.relationship}`, 'good');
  }

  finishNode(node) {
    this.applyNodeEffects(node);
    const cb = this.dialogue.onEnd;
    this.endDialogue();
    if (cb) cb();
  }

  /** Called every frame by the game to handle dialogue keyboard input. */
  updateDialogue(input) {
    if (this.current !== 'dialogue' || !this.dialogue) return;
    const node = this.dialogue.tree.nodes[this.dialogue.nodeId];
    if (!node) return;
    if (node.choices?.length) {
      for (let i = 0; i < Math.min(4, node.choices.length); i++) {
        if (input.wasPressed(`Digit${i + 1}`)) { this.pickChoice(node.choices[i]); return; }
      }
      if (input.wasPressed('jump') || input.wasPressed('confirm')) this.pickChoice(node.choices[0]);
    } else if (input.wasPressed('jump') || input.wasPressed('confirm')) {
      this.advanceDialogue();
    }
  }

  /** Advances the current dialogue node by one step (or takes a default choice). */
  advanceDialogue() {
    if (this.current !== 'dialogue' || !this.dialogue) return;
    const node = this.dialogue.tree.nodes[this.dialogue.nodeId];
    if (!node) return;
    if (node.choices?.length) this.pickChoice(node.choices[0]);
    else if (node.end) this.finishNode(node);
    else this.advanceNode(node);
  }

  endDialogue() {
    this.dialogue = null;
    this.hide('dialogue');
    this.current = 'game';
  }

  // ───────────────────────────── cutscenes ─────────────────────────────
  playCutscene({ title, lines, onEnd, mood }) {
    this.cutscene = { lines, onEnd, index: 0 };
    this.hideAll();
    this.show('cutscene');
    this.current = 'cutscene';
    $('cutTitle').textContent = title || '';
    const container = $('cutLines');
    container.innerHTML = '';
    lines.forEach((l, i) => {
      const p = document.createElement('p');
      if (typeof l === 'string') { p.textContent = l; }
      else { p.textContent = l.text; if (l.style === 'strong') p.classList.add('strong'); if (l.style === 'whisper') p.classList.add('whisper'); }
      p.style.animationDelay = `${i * 0.55}s`;
      container.appendChild(p);
    });
    if (mood) this.game.audio.setMood(mood);
    this.cutTimer = Math.max(2.4, lines.length * 0.55 + 1.6);
  }

  updateCutscene(dt, input) {
    if (this.current !== 'cutscene' || !this.cutscene) return;
    this.cutTimer -= dt;
    if ((this.cutTimer <= 0) || input.wasPressed('jump') || input.wasPressed('confirm') || input.mousePressed.left) {
      const cb = this.cutscene.onEnd;
      this.cutscene = null;
      this.hide('cutscene');
      this.current = 'game';
      if (cb) cb();
    }
  }

  // ───────────────────────────── panels: options / howto / credits / saves ─────────────────────────────
  openPanel(kind) {
    this.panelKind = kind;
    this.hideAll();
    this.show('panelScreen');
    this.current = 'panel';
    const titles = { options: 'OPTIONS', howto: 'HOW TO PLAY', credits: 'CREDITS', load: 'LOAD GAME' };
    $('panelTitle').textContent = titles[kind] || 'PANEL';
    const body = $('panelBody');
    if (kind === 'options') body.innerHTML = this.optionsHtml();
    else if (kind === 'howto') body.innerHTML = this.howtoHtml();
    else if (kind === 'credits') body.innerHTML = this.creditsHtml();
    else if (kind === 'load') body.innerHTML = this.loadHtml();
  }

  optionsHtml() {
    const s = this.game.save.settings || {};
    return `
      <div class="stat-row"><span>Music</span><b>${s.music !== false ? 'ON' : 'OFF'}</b></div>
      <div class="stat-row"><span>Sound effects</span><b>${s.sfx !== false ? 'ON' : 'OFF'}</b></div>
      <div class="stat-row"><span>Show vision cones</span><b>${s.showVision !== false ? 'ON' : 'OFF'}</b></div>
      <div class="stat-row"><span>Difficulty</span><b>${['Relaxed', 'Standard', 'Hard', 'Master'][(s.difficulty || 1)]}</b></div>
      <div class="stat-row"><span>Master Assassin mode</span><b>${s.masterAssassin ? 'ON' : 'OFF'}</b></div>
      <div style="margin-top:1rem;display:flex;gap:.5rem;flex-wrap:wrap">
        <button class="menu-btn small" data-opt="music">TOGGLE MUSIC</button>
        <button class="menu-btn small" data-opt="sfx">TOGGLE SFX</button>
        <button class="menu-btn small" data-opt="showVision">TOGGLE VISION CONES</button>
        <button class="menu-btn small" data-opt="difficulty">CYCLE DIFFICULTY</button>
        <button class="menu-btn small" data-opt="masterAssassin">TOGGLE MASTER MODE</button>
        <button class="menu-btn small" data-opt="wipe">ERASE ALL SAVES</button>
      </div>
      <p class="empty-note">Master Assassin mode: stronger enemies, limited healing, higher detection, no minimap intel, optional permadeath. Then cycle the difficulty button to confirm the challenge.</p>
    `;
  }

  howtoHtml() {
    return `
      <div class="section-title">CONTROLS — DESKTOP</div>
      <div class="grid-cards">
        <div class="card"><h4>MOVE</h4><div class="card-sub">A / D — walk<br>SHIFT — sprint<br>DASH — tap SHIFT while moving (auto-dash in air with skill)</div></div>
        <div class="card"><h4>PARKOUR</h4><div class="card-sub">SPACE — jump<br>W — climb / enter<br>S — drop / descend<br>Wall jump: jump into a wall then SPACE<br>Ledge grab: fall alongside a ledge<br>Rope: press W near a rope</div></div>
        <div class="card"><h4>COMBAT</h4><div class="card-sub">LEFT CLICK — attack / heavy combo<br>RIGHT CLICK — block (hold)<br>Tap RIGHT CLICK just before a hit — perfect parry<br>Q — assassination</div></div>
        <div class="card"><h4>WORLD</h4><div class="card-sub">E — interact<br>F — gadget<br>M — map · I — gear · K — skills<br>J — quests · C — codex<br>ESC — pause</div></div>
      </div>
      <div class="section-title">MOBILE</div>
      <p class="empty-note">Left thumb: virtual stick. Right thumb: JUMP, DASH, ATK, BLK, GAD, KILL, USE buttons. Menus are opened from the pause button.</p>
      <div class="section-title">HOW TO PLAY WELL</div>
      <div class="grid-cards">
        <div class="card"><h4>DETECTION</h4><div class="card-sub">Enemies fill a detection meter while you are in their vision cone. At 100% they alert the district and call reinforcements. Break line of sight, use shadows, grass, crowds and rooftops.</div></div>
        <div class="card"><h4>ASSASSINATION</h4><div class="card-sub">Unaware targets can be killed instantly. Rear, air, ledge, rope, hidden and sprint variants all work. Hunters and Assassin Hunters can see through hiding spots and sometimes counter you.</div></div>
        <div class="card"><h4>THREE ROUTES, ALWAYS</h4><div class="card-sub">Every district has a ground route, a rooftop route, and a secret route through the tunnels. Ground = fight, rooftop = parkour, secret = stealth.</div></div>
        <div class="card"><h4>RATING</h4><div class="card-sub">S / A / B / C / D. Detection, kills, civilian harm and time all reduce your score. Optional objectives increase it and multiply rewards.</div></div>
      </div>
    `;
  }

  creditsHtml() {
    return `
      <div class="section-title">SHADOWS OF VESPERA</div>
      <p class="empty-note">A 2D browser stealth action game. Built as a single static HTML5 site — no server, no build step, no external assets.</p>
      <div class="stat-row"><span>Design & code</span><b>Generated for this project</b></div>
      <div class="stat-row"><span>Engine</span><b>Custom Canvas 2D / ES modules</b></div>
      <div class="stat-row"><span>Audio</span><b>Procedural WebAudio synthesis</b></div>
      <div class="stat-row"><span>Art</span><b>Procedural vector rendering</b></div>
      <div class="section-title">THE CITY</div>
      <div class="stat-row"><span>Districts</span><b>${DISTRICT_ORDER.length}</b></div>
      <div class="stat-row"><span>Missions</span><b>${Object.keys(MISSIONS).length}</b></div>
      <div class="stat-row"><span>Weapons</span><b>${WEAPON_ORDER.length}</b></div>
      <div class="stat-row"><span>Armor pieces</span><b>${Object.keys(ARMOR).length}</b></div>
      <div class="stat-row"><span>Gadgets</span><b>${GADGET_ORDER.length}</b></div>
      <div class="stat-row"><span>Achievements</span><b>${ACHIEVEMENTS.length}</b></div>
    `;
  }

  loadHtml() {
    const slots = this.game.saves.list();
    return slots.map((s) => {
      if (!s.data) return `<div class="quest-item"><h4>Slot ${s.slot === 'auto' ? 'AUTO' : s.slot + 1} <span class="tag locked">EMPTY</span></h4></div>`;
      const d = s.data;
      const when = d.savedAt ? new Date(d.savedAt).toLocaleString() : 'unknown';
      return `<div class="quest-item">
        <h4>Slot ${s.slot === 'auto' ? 'AUTO' : (s.slot + 1)} <span class="tag">${d._incompatible ? 'INCOMPATIBLE' : `Lv ${d.level}`}</span></h4>
        <div class="q-meta">${when} · ${esc(d.currentDistrict || '')}</div>
        <p>${d.missionsCompleted?.length || 0} missions · ${(d.collectiblesFound || []).length} collectibles · ${Math.round(d.xp || 0)} XP</p>
        <button data-load-slot="${s.slot}" ${d._incompatible ? 'disabled' : ''}>LOAD</button>
        <button data-delete-slot="${s.slot}">DELETE</button>
      </div>`;
    }).join('');
  }

  // ───────────────────────────── ending screens ─────────────────────────────
  showEnd(title, text, opts = {}) {
    this.hideAll();
    this.show('endScreen');
    this.current = 'end';
    // Freeze the simulation behind the end screen; retry/menu restart it.
    this.game.state = 'ended';
    this.game.world.active = false;
    $('endTitle').textContent = title;
    $('endText').textContent = text;
    $('endRetry').classList.toggle('hidden', !!opts.noRetry);
    this.endOpts = opts;
  }

  // ───────────────────────────── event wiring ─────────────────────────────
  bindEvents() {
    // Main menu buttons
    document.querySelectorAll('[data-menu]').forEach((b) => {
      b.addEventListener('click', () => {
        this.game.audio.sfx('menu');
        const m = b.dataset.menu;
        if (m === 'new') this.game.newGame();
        else if (m === 'continue') this.game.continueGame();
        else if (m === 'load') this.openPanel('load');
        else if (m === 'howto') this.openPanel('howto');
        else if (m === 'options') this.openPanel('options');
        else if (m === 'credits') this.openPanel('credits');
      });
    });
    document.querySelectorAll('[data-close-panel]').forEach((b) => b.addEventListener('click', () => {
      this.game.audio.sfx('ui');
      if (this.game.save && this.game.world.active) this.openPause();
      else this.openMainMenu();
    }));
    document.querySelectorAll('[data-close-menus]').forEach((b) => b.addEventListener('click', () => this.game.closeMenus()));
    document.querySelectorAll('[data-close-shop]').forEach((b) => b.addEventListener('click', () => this.game.closeShop()));
    document.querySelectorAll('[data-close-safehouse]').forEach((b) => b.addEventListener('click', () => this.game.closeSafehouse()));
    document.querySelectorAll('[data-pause]').forEach((b) => b.addEventListener('click', () => {
      const a = b.dataset.pause;
      if (a === 'resume') this.game.resume();
      else if (a === 'codex') this.openMenus('codex');
      else if (a === 'options') this.openPanel('options');
      else if (a === 'mainmenu') this.game.quitToMenu();
    }));
    $('cutSkip')?.addEventListener('click', () => { this.cutTimer = 0; });
    // Tapping the cinematic itself skips it. Listening on the overlay (not the
    // canvas) means the click is never swallowed, and mobile has a way out.
    $('cutscene')?.addEventListener('click', () => { this.cutTimer = 0; });
    $('dialogue')?.addEventListener('click', (e) => {
      if (e.target.closest('.dlg-choices')) return;
      this.advanceDialogue();
    });
    $('btnContinue')?.addEventListener('click', () => {});
    $('soundToggle')?.addEventListener('click', () => {
      const on = this.game.audio.enabled;
      this.game.audio.setEnabled(!on);
      $('soundToggle').textContent = !on ? '🔊' : '🔇';
    });

    // Delegated clicks for dynamic content
    document.addEventListener('click', (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      const g = this.game;
      if (t.dataset.tab) { g.audio.sfx('ui'); this.selectTab(t.dataset.tab); return; }
      if (t.dataset.equipWeapon) { g.progression.equipWeapon(t.dataset.equipWeapon); this.renderInventory(); return; }
      if (t.dataset.equipArmor) { g.progression.equipArmor(t.dataset.equipArmor); this.renderInventory(); return; }
      if (t.dataset.equipGadget) { g.progression.equipGadget(t.dataset.equipGadget); this.renderInventory(); return; }
      if (t.dataset.skill) {
        const ok = g.progression.unlockSkill(t.dataset.skill);
        if (!ok) { const c = g.progression.canUnlockSkill(t.dataset.skill); g.toast(c.reason || 'Cannot unlock', 'bad'); }
        this.renderSkills(); return;
      }
      if (t.dataset.respec) { g.progression.respec(); this.renderInventory(); return; }
      if (t.dataset.buyKind) {
        const kind = t.dataset.buyKind, id = t.dataset.buyId, count = Number(t.dataset.buyCount || 1);
        let ok = false;
        if (kind === 'weapon') ok = g.progression.buyWeapon(id);
        else if (kind === 'armor') ok = g.progression.buyArmor(id);
        else if (kind === 'gadget') ok = g.progression.buyGadget(id, count);
        else if (kind === 'boost') ok = g.progression.buyBoost(id);
        else if (kind === 'skillpoint') ok = g.progression.buySkillPoint();
        else if (kind === 'intel') { if (g.progression.spend('coins', 120)) { g.progression.addIntel(3); g.toast('District intel acquired', 'good'); ok = true; } }
        else if (kind === 'consumable') { if (g.progression.spend('coins', 45)) { g.player.heal(60); g.toast('Health restored', 'good'); ok = true; } }
        if (!ok) g.toast('Cannot afford that', 'bad');
        this.renderShop(); return;
      }
      if (t.dataset.startMission) { g.startMissionFromMenu(t.dataset.startMission); return; }
      if (t.dataset.allyLevel) { g.progression.levelUpAlly(t.dataset.allyLevel); this.renderRecruits(); return; }
      if (t.dataset.allyToggle) {
        const id = t.dataset.allyToggle;
        const cur = g.save.activeAllies.slice();
        const i = cur.indexOf(id);
        if (i >= 0) cur.splice(i, 1); else cur.push(id);
        g.progression.setActiveAllies(cur);
        g.syncAllies();
        this.renderRecruits(); return;
      }
      if (t.dataset.safe) {
        const a = t.dataset.safe;
        if (a === 'rest') { g.player.fullHeal(); g.toast('Rested — fully healed', 'good'); }
        else if (a === 'save') { g.saveGame(0); }
        else if (a === 'respec') { g.progression.respec(); }
        else if (a === 'blackmarket') { this.openShop('blackTokens', 'Black Market'); return; }
        this.renderSafehouse(); return;
      }
      if (t.dataset.loadSlot) { g.loadGame(t.dataset.loadSlot); return; }
      if (t.dataset.deleteSlot) { g.saves.remove(t.dataset.deleteSlot === 'auto' ? 'auto' : Number(t.dataset.deleteSlot)); this.openPanel('load'); return; }
      if (t.dataset.opt) {
        const o = t.dataset.opt;
        const s = g.save.settings;
        if (o === 'music') { s.music = s.music === false; g.audio.setEnabled(s.music); }
        else if (o === 'sfx') s.sfx = s.sfx === false;
        else if (o === 'showVision') s.showVision = s.showVision === false;
        else if (o === 'difficulty') s.difficulty = ((s.difficulty || 1) + 1) % 4;
        else if (o === 'masterAssassin') { s.masterAssassin = !s.masterAssassin; g.save.masterAssassinMode = s.masterAssassin; }
        else if (o === 'wipe') { for (let i = 0; i < 3; i++) g.saves.remove(i); g.saves.remove('auto'); g.toast('All saves erased', 'bad'); }
        g.saves.saveSettings(s);
        this.openPanel('options');
        return;
      }
      if (t.id === 'endRetry') { g.retryMission(); return; }
      if (t.id === 'endMenu') { g.quitToMenu(); return; }
    });
  }
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function labelStat(k) {
  const labels = {
    maxHp: 'HP', damage: 'DMG', armor: 'ARM', detectionResist: 'STEALTH', moveSpeed: 'SPEED',
    attackSpeed: 'ATK SPD', climbSpeed: 'CLIMB', jumpBonus: 'JUMP', noise: 'NOISE',
    assassinationSpeed: 'KILL SPD', rangedDamage: 'RANGED', stagger: 'STAGGER',
    parryWindow: 'PARRY', parryStun: 'PARRY STUN', armorPen: 'ARMOR PEN',
    heavyDamage: 'HEAVY', counterDamage: 'COUNTER', executionHeal: 'EXECUTE HEAL',
    allyDamage: 'ALLY DMG', allyHealth: 'ALLY HP', allyCooldown: 'ALLY CD', allySlots: 'ALLY SLOTS',
    chainAssassinate: 'CHAIN', shadowInvisibility: 'SHADOW', maxStamina: 'STAMINA',
    lifeSteal: 'LIFESTEAL', rangedDamageMul: 'RANGED', crowdBlend: 'CROWD',
  };
  return labels[k] || k.toUpperCase();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text).split(' ');
  let line = '';
  let yy = y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = w;
      yy += lineHeight;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, yy);
}
