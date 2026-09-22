/** Keyboard, mouse and touch input with edge-triggered "pressed" queries. */

const KEY_ALIASES = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  Space: 'jump',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
  KeyE: 'interact',
  KeyQ: 'assassinate',
  KeyF: 'gadget',
  KeyM: 'map',
  KeyI: 'inventory',
  KeyK: 'skills',
  KeyJ: 'quests',
  KeyC: 'codex',
  KeyR: 'reload',
  Escape: 'pause',
  Enter: 'confirm',
  Tab: 'tab',
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.held = new Set();
    this.pressed = new Set();   // edge this frame
    this.released = new Set();
    this.mouse = { x: 0, y: 0, worldX: 0, worldY: 0, left: false, right: false };
    this.mousePressed = { left: false, right: false };
    this.touchVec = { x: 0, y: 0 };
    this.touchActions = new Set();
    this.touchPressed = new Set();
    this.touchActive = false;
    this._bindKeyboard();
    this._bindMouse();
    this._bindTouch();
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      const a = KEY_ALIASES[e.code];
      if (!a) return;
      if (!this.held.has(a)) this.pressed.add(a);
      this.held.add(a);
      if (['jump', 'up', 'down', 'left', 'right', 'tab'].includes(a)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      const a = KEY_ALIASES[e.code];
      if (!a) return;
      this.held.delete(a);
      this.released.add(a);
    });
    window.addEventListener('blur', () => { this.held.clear(); this.touchVec = { x: 0, y: 0 }; });
  }

  _bindMouse() {
    const update = (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
    };
    window.addEventListener('mousemove', update);
    this.canvas.addEventListener('mousedown', (e) => {
      update(e);
      if (e.button === 0) { this.mouse.left = true; this.mousePressed.left = true; }
      if (e.button === 2) { this.mouse.right = true; this.mousePressed.right = true; }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _bindTouch() {
    const zone = document.getElementById('joystickZone');
    const knob = document.getElementById('joystickKnob');
    if (!zone) return;
    let active = null;
    const R = 44;
    const move = (t) => {
      const r = zone.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let dx = t.clientX - cx, dy = t.clientY - cy;
      const len = Math.hypot(dx, dy) || 1;
      const cl = Math.min(len, R);
      dx = (dx / len) * cl; dy = (dy / len) * cl;
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.touchVec.x = dx / R;
      this.touchVec.y = dy / R;
      this.touchActive = true;
    };
    const end = () => {
      active = null;
      knob.style.transform = '';
      this.touchVec.x = 0; this.touchVec.y = 0;
    };
    zone.addEventListener('touchstart', (e) => { active = e.changedTouches[0].identifier; move(e.changedTouches[0]); e.preventDefault(); }, { passive: false });
    zone.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) if (t.identifier === active) move(t);
      e.preventDefault();
    }, { passive: false });
    zone.addEventListener('touchend', (e) => { for (const t of e.changedTouches) if (t.identifier === active) end(); }, { passive: false });
    zone.addEventListener('touchcancel', end);

    for (const btn of document.querySelectorAll('.tbtn')) {
      const act = btn.dataset.act;
      if (!act) continue;
      const press = (e) => {
        btn.classList.add('pressed');
        if (!this.touchActions.has(act)) this.touchPressed.add(act);
        this.touchActions.add(act);
        e.preventDefault();
      };
      const release = (e) => { btn.classList.remove('pressed'); this.touchActions.delete(act); e.preventDefault(); };
      btn.addEventListener('touchstart', press, { passive: false });
      btn.addEventListener('touchend', release, { passive: false });
      btn.addEventListener('touchcancel', release, { passive: false });
      btn.addEventListener('mousedown', press);
      btn.addEventListener('mouseup', release);
      btn.addEventListener('mouseleave', release);
    }
  }

  isDown(a) { return this.held.has(a) || this.touchActions.has(a); }
  wasPressed(a) { return this.pressed.has(a) || this.touchPressed.has(a); }

  /** Horizontal movement intent, -1..1, mixing keyboard and virtual stick. */
  moveX() {
    let v = 0;
    if (this.isDown('left')) v -= 1;
    if (this.isDown('right')) v += 1;
    if (Math.abs(this.touchVec.x) > 0.22) v += this.touchVec.x;
    return Math.max(-1, Math.min(1, v));
  }
  moveY() {
    let v = 0;
    if (this.isDown('up')) v -= 1;
    if (this.isDown('down')) v += 1;
    if (Math.abs(this.touchVec.y) > 0.3) v += this.touchVec.y;
    return Math.max(-1, Math.min(1, v));
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.mousePressed.left = false;
    this.mousePressed.right = false;
    this.touchPressed.clear();
  }
}
