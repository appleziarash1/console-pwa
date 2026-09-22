/**
 * LocalStorage save manager. Three save slots plus autosave. Save data is
 * versioned so older saves can be migrated or rejected cleanly.
 */

const KEY = 'sov.save.';
const SETTINGS_KEY = 'sov.settings';
export const SAVE_VERSION = 3;

export class SaveManager {
  constructor() {
    this.slotCount = 3;
  }

  _k(slot) { return `${KEY}${slot}`; }

  hasSlot(slot) {
    try { return !!localStorage.getItem(this._k(slot)); } catch { return false; }
  }

  list() {
    const out = [];
    for (let i = 0; i < this.slotCount; i++) {
      const raw = this._read(this._k(i));
      out.push({ slot: i, data: raw });
    }
    const auto = this._read(this._k('auto'));
    out.push({ slot: 'auto', data: auto });
    return out;
  }

  _read(key) {
    try {
      const s = localStorage.getItem(key);
      if (!s) return null;
      const d = JSON.parse(s);
      if (d.version !== SAVE_VERSION) return { _incompatible: true, ...d };
      return d;
    } catch { return null; }
  }

  read(slot) { return this._read(this._k(slot)); }

  write(slot, snapshot) {
    try {
      const payload = { version: SAVE_VERSION, savedAt: Date.now(), ...snapshot };
      localStorage.setItem(this._k(slot), JSON.stringify(payload));
      return true;
    } catch (e) {
      console.warn('Save failed', e);
      return false;
    }
  }

  remove(slot) {
    try { localStorage.removeItem(this._k(slot)); } catch { /* ignore */ }
  }

  newestSlot() {
    let best = null, bestT = -1;
    for (const s of this.list()) {
      if (!s.data || s.data._incompatible) continue;
      if (s.data.savedAt > bestT) { bestT = s.data.savedAt; best = s.slot; }
    }
    return best;
  }

  loadSettings() {
    try {
      const s = localStorage.getItem(SETTINGS_KEY);
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  }

  saveSettings(settings) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  }
}

export const saves = new SaveManager();
