/**
 * Procedural WebAudio soundtrack + SFX. No external assets, so the whole game
 * stays a single static site. Music is generated from a scale/mood table and
 * layered per game context (exploration / stealth / combat / boss / chase).
 */

const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const freq = (name, octave) => 440 * Math.pow(2, (NOTE[name] + (octave - 4) * 12 - 9) / 12);

const MOODS = {
  exploration: { root: 'D', scale: [0, 2, 3, 5, 7, 8, 10], bpm: 84, pad: 0.20, arp: 0.14, drums: false, wave: 'triangle' },
  stealth:     { root: 'A', scale: [0, 1, 3, 5, 7, 8, 10], bpm: 68, pad: 0.16, arp: 0.10, drums: false, wave: 'sine' },
  combat:      { root: 'E', scale: [0, 2, 3, 5, 7, 9, 10], bpm: 132, pad: 0.22, arp: 0.20, drums: true, wave: 'sawtooth' },
  boss:        { root: 'C', scale: [0, 1, 3, 4, 6, 8, 10], bpm: 148, pad: 0.26, arp: 0.22, drums: true, wave: 'square' },
  chase:       { root: 'F#', scale: [0, 2, 4, 6, 7, 9, 11], bpm: 160, pad: 0.24, arp: 0.26, drums: true, wave: 'sawtooth' },
  story:       { root: 'G', scale: [0, 2, 4, 5, 7, 9, 11], bpm: 60, pad: 0.24, arp: 0.08, drums: false, wave: 'sine' },
  victory:     { root: 'C', scale: [0, 2, 4, 5, 7, 9, 11], bpm: 96, pad: 0.30, arp: 0.24, drums: false, wave: 'triangle' },
  defeat:      { root: 'A', scale: [0, 2, 3, 5, 6, 8, 10], bpm: 52, pad: 0.22, arp: 0.06, drums: false, wave: 'sine' },
  menu:        { root: 'D', scale: [0, 2, 3, 5, 7, 8, 10], bpm: 72, pad: 0.22, arp: 0.12, drums: false, wave: 'sine' },
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.enabled = true;
    this.mood = 'menu';
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
    this.reverb = null;
  }

  init() {
    if (this.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return false; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);

    const conv = this.ctx.createConvolver();
    const len = this.ctx.sampleRate * 1.8;
    const buf = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    conv.buffer = buf;
    const wet = this.ctx.createGain(); wet.gain.value = 0.22;
    conv.connect(wet); wet.connect(this.master);
    this.reverb = conv;

    this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.5; this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.85; this.sfxGain.connect(this.master);
    this._startClock();
    return true;
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.6 : 0;
  }

  setMood(mood) {
    if (!MOODS[mood] || this.mood === mood) return;
    this.mood = mood;
    this.step = 0;
  }

  _startClock() {
    if (this.timer) return;
    const tick = () => {
      if (this.ctx && this.enabled) this._schedule();
      this.timer = setTimeout(tick, 90);
    };
    tick();
  }

  _schedule() {
    const m = MOODS[this.mood];
    const spb = 60 / m.bpm / 2; // eighth notes
    while (this.nextTime < this.ctx.currentTime + 0.3) {
      this._playStep(m, this.step, this.nextTime, spb);
      this.step++;
      this.nextTime += spb;
    }
    if (this.nextTime < this.ctx.currentTime) this.nextTime = this.ctx.currentTime;
  }

  _playStep(m, step, time, spb) {
    const scale = m.scale;
    const deg = (n) => scale[((n % scale.length) + scale.length) % scale.length];
    const semis = (n, oct) => this.freqRoot(m.root) * Math.pow(2, (deg(n) + oct * 12) / 12);

    // Pad every 8 steps
    if (step % 8 === 0) {
      const oct = step % 16 === 0 ? 0 : 1;
      this._tone(semis(0, oct - 1), time, spb * 9, m.wave, m.pad, 1.4);
      this._tone(semis(4, oct - 1), time, spb * 9, m.wave, m.pad * 0.6, 1.4);
    }
    // Arpeggio
    if (step % 2 === 0) {
      const pattern = [0, 2, 4, 6, 4, 2, 7, 4];
      const n = pattern[(step / 2) % pattern.length];
      this._tone(semis(n, 1), time, spb * 1.4, m.wave, m.arp, 0.9);
    }
    // Melody flourishes
    if (step % 16 === 8) {
      this._tone(semis(6, 2), time, spb * 3, m.wave, m.arp * 0.8, 1.1);
    }
    // Drums
    if (m.drums) {
      if (step % 8 === 0) this._noise(time, 0.16, 0.35, 90);
      if (step % 8 === 4) this._noise(time, 0.12, 0.25, 160);
      if (step % 2 === 1) this._noise(time, 0.035, 0.09, 5200);
    }
  }

  freqRoot(root) { return freq(root, 3); }

  _tone(f, time, dur, wave, gain, detuneCents = 0, dest) {
    const o = this.ctx.createOscillator();
    o.type = wave;
    o.frequency.value = f;
    if (detuneCents) o.detune.value = detuneCents;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(gain, time + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o.connect(g);
    g.connect(dest || this.musicGain);
    if (this.reverb && !dest) g.connect(this.reverb);
    o.start(time); o.stop(time + dur + 0.05);
  }

  _noise(time, dur, gain, cutoff) {
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const filt = this.ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = cutoff;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.connect(filt); filt.connect(g); g.connect(this.sfxGain);
    src.start(time); src.stop(time + dur);
  }

  /** Play a one-shot sound effect. `name` maps to a small synth recipe. */
  sfx(name, opts = {}) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + 0.001;
    const v = opts.volume ?? 1;
    switch (name) {
      case 'sword': this._swish(t, 1400, 420, 0.13, 0.20 * v); break;
      case 'swordHeavy': this._swish(t, 900, 240, 0.22, 0.28 * v); break;
      case 'blade': this._swish(t, 2600, 900, 0.09, 0.18 * v); break;
      case 'hit': this._noise(t, 0.12, 0.34 * v, 900); this._toneSfx(140, t, 0.12, 'square', 0.2 * v); break;
      case 'hurt': this._toneSfx(220, t, 0.18, 'sawtooth', 0.22 * v, 90); break;
      case 'parry': this._toneSfx(2100, t, 0.16, 'triangle', 0.24 * v, 400); this._toneSfx(3100, t + 0.01, 0.1, 'sine', 0.16 * v); break;
      case 'block': this._toneSfx(420, t, 0.1, 'square', 0.2 * v); break;
      case 'arrow': this._swish(t, 3000, 1600, 0.1, 0.16 * v); break;
      case 'jump': this._toneSfx(300, t, 0.1, 'triangle', 0.13 * v, 180); break;
      case 'land': this._noise(t, 0.1, 0.2 * v, 500); break;
      case 'step': this._noise(t, 0.05, 0.055 * v, 2200); break;
      case 'climb': this._noise(t, 0.08, 0.09 * v, 1400); break;
      case 'coin': this._toneSfx(1180, t, 0.09, 'triangle', 0.16 * v); this._toneSfx(1760, t + 0.05, 0.12, 'triangle', 0.14 * v); break;
      case 'alert': this._toneSfx(700, t, 0.16, 'square', 0.2 * v); this._toneSfx(560, t + 0.14, 0.2, 'square', 0.2 * v); break;
      case 'alarm': for (let i = 0; i < 3; i++) this._toneSfx(i % 2 ? 620 : 880, t + i * 0.22, 0.2, 'square', 0.18 * v); break;
      case 'assassinate': this._noise(t, 0.16, 0.3 * v, 700); this._toneSfx(90, t, 0.3, 'sawtooth', 0.2 * v, -40); break;
      case 'kill': this._toneSfx(180, t, 0.22, 'sawtooth', 0.2 * v, -120); this._noise(t, 0.16, 0.2 * v, 600); break;
      case 'death': this._toneSfx(160, t, 0.5, 'sawtooth', 0.2 * v, -200); break;
      case 'door': this._noise(t, 0.22, 0.16 * v, 320); break;
      case 'chest': this._toneSfx(520, t, 0.14, 'triangle', 0.16 * v); this._toneSfx(780, t + 0.08, 0.2, 'triangle', 0.14 * v); break;
      case 'pickup': this._toneSfx(920, t, 0.08, 'sine', 0.14 * v); this._toneSfx(1380, t + 0.06, 0.14, 'sine', 0.12 * v); break;
      case 'smoke': this._noise(t, 0.5, 0.18 * v, 1100); break;
      case 'fire': this._noise(t, 0.6, 0.24 * v, 700); break;
      case 'explosion': this._noise(t, 0.7, 0.42 * v, 320); this._toneSfx(60, t, 0.5, 'sawtooth', 0.3 * v, -30); break;
      case 'whoosh': this._swish(t, 600, 180, 0.3, 0.2 * v); break;
      case 'dash': this._swish(t, 900, 260, 0.22, 0.2 * v); break;
      case 'levelup': [0, 4, 7, 12].forEach((n, i) => this._toneSfx(this.freqRoot('D') * Math.pow(2, n / 12) * 2, t + i * 0.1, 0.4, 'triangle', 0.16 * v)); break;
      case 'objective': this._toneSfx(880, t, 0.12, 'sine', 0.16 * v); this._toneSfx(1320, t + 0.1, 0.24, 'sine', 0.14 * v); break;
      case 'fail': [0, -3, -7].forEach((n, i) => this._toneSfx(this.freqRoot('A') * Math.pow(2, n / 12), t + i * 0.16, 0.4, 'sine', 0.18 * v)); break;
      case 'ui': this._toneSfx(660, t, 0.05, 'sine', 0.08 * v); break;
      case 'menu': this._toneSfx(440, t, 0.08, 'triangle', 0.1 * v); this._toneSfx(660, t + 0.05, 0.1, 'triangle', 0.08 * v); break;
      default: break;
    }
  }

  _toneSfx(f, time, dur, wave, gain, bend = 0) {
    const o = this.ctx.createOscillator(); o.type = wave;
    o.frequency.setValueAtTime(f, time);
    if (bend) o.frequency.exponentialRampToValueAtTime(Math.max(40, f + bend), time + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(gain, time + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o.connect(g); g.connect(this.sfxGain);
    o.start(time); o.stop(time + dur + 0.03);
  }

  _swish(time, f1, f2, dur, gain) {
    const o = this.ctx.createOscillator(); o.type = 'bandpass' === 'bandpass' ? 'sawtooth' : 'sine';
    o.frequency.setValueAtTime(f1, time);
    o.frequency.exponentialRampToValueAtTime(Math.max(80, f2), time + dur);
    const filt = this.ctx.createBiquadFilter(); filt.type = 'bandpass'; filt.Q.value = 1.2; filt.frequency.value = (f1 + f2) / 2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(gain, time + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o.connect(filt); filt.connect(g); g.connect(this.sfxGain);
    o.start(time); o.stop(time + dur + 0.03);
  }
}

export const audio = new AudioEngine();
