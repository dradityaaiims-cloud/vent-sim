// Physics engine: pure JS, no DOM. Fixed 2 ms step.
// Core = extended equation of motion (van Diepen et al., Biomed Signal Process Control 118 (2026) 109770, CC BY 4.0):
//   Pao = Pel(V) + K1*Vdot + K2*Vdot|Vdot| + Pvisco - Pmus,   dPvisco/dt = Vdot/Cd - Pvisco/(Rd*Cd)
// DEVIATION from the paper's "+ PEEPext": here Pel(V) is recoil above the relaxed volume (V=0 at 0 cmH2O), so PEEP
// enters through Pao itself. Adding PEEPext on top would leave the lung at V=0 and PEEP would do nothing.
// Expiration is an UNVALIDATED extension (the paper models inspiration only).
import { satO2, paO2FromShunt, phHH, baseExcess, alveolarPO2 } from './gas.js';
import { PRESETS } from './presets.js';

export const DT = 0.002;
// Rohrer constants, van Diepen 2026 Table 3 (cmH2O s/L, cmH2O s^2/L^2)
export const ETT = { 7: { k1: 1.44, k2: 6.67 }, 8: { k1: 1.28, k2: 4.15 }, 9: { k1: 0.826, k2: 2.57 } };
export const pbw = (sex, h) => (sex === 'F' ? 45.5 : 50) + 0.91 * (h - 152.4);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

export const DEFAULTS = {
  mode: 'VC',        // VC (VC-CMV) | PC (PC-CMV) | PSV | APV (APVcmv)
  vt: 450, rr: 14, peep: 5, fio2: 0.4, ti: 1.0, flow: 'square', // flow: square | decel
  pc: 15, ps: 10, rise: 0.1, trig: 3, cycle: 25, tiMax: 3, // pc/ps above PEEP; trig L/min; cycle % of peak flow
  holdDur: 1.0, apnea: 20, plimit: 70,
};

export class Sim {
  constructor(key = 'normal', mods = {}, set = {}) { this.load(key, mods, set); }

  load(key, mods = {}, set = {}) {
    const p = structuredClone(PRESETS[key]);
    this.key = key;
    this.pt = { ...p, ...mods, drive: { ...p.drive, ...(mods.drive || {}) }, hemo: { ...p.hemo, ...(mods.hemo || {}) } };
    this.set = { ...DEFAULTS, ...set };
    this.rec = true; // record display samples
    this._init();
  }

  patch(mods) { // live patient change (scenario events / actions)
    const { drive, hemo, ...rest } = mods;
    Object.assign(this.pt, rest);
    if (drive) Object.assign(this.pt.drive, drive);
    if (hemo) Object.assign(this.pt.hemo, hemo);
  }
  configure(set) { Object.assign(this.set, set); }

  _init() {
    const pt = this.pt;
    if (pt.ven) { const { a, b, c, d } = pt.ven; pt.ven.v0 = a + b / (1 + Math.exp(c / d)); }
    this.s = { t: 0, V: 0, pv: 0, ph: 'exp', tPh: 1, tBr: 99, pmus: 0, eff: null, nextEff: 1, vStart: 0, peakFlow: 0,
      br: null, apvP: 10, holdReq: false, ehReq: false, pauseDur: 0, seed: 12345, nBreath: 0, tick: 0, samp: 0, tickN: 0,
      vdot: 0, pao: this.set.peep, ptr: this.set.peep, cp: 0 };
    this.s.V = this._eqV(this.set.peep);
    this.g = { paco2: 40, pao2: 100, spo2: 98, map: pt.hemo.map0, hr: pt.hemo.hr0, va: 0, shunt: pt.shunt0 };
    this.alv = []; this.breaths = []; this.starts = []; this.efforts = []; this.out = [];
    this.hold = null; this.ehold = null; this.last = null; this.nAlarm = 0;
  }

  get k1() { return this.pt.k1aw + ETT[this.pt.ett].k1 * this.pt.ettMult; }
  get k2() { return this.pt.k2aw + ETT[this.pt.ett].k2 * this.pt.ettMult; }
  get pbw() { return pbw(this.pt.sex, this.pt.height); }
  get t() { return this.s.t; }

  // Elastic recoil (lung in series with chest wall) above atmosphere at volume V above relaxed volume.
  pel(V) {
    const pt = this.pt, vl = V / pt.cMult;
    let pl;
    if (pt.ven) {
      const { a, b, c, d, v0 } = pt.ven;
      const x = clamp((vl + v0 - a) / b, 1e-3, 1 - 1e-3);
      pl = c - d * Math.log(1 / x - 1); // inverse Venegas sigmoid
    } else pl = vl / pt.cl;
    return pl + V / pt.ccw;
  }
  _eqV(p) { let lo = -1, hi = 8; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (this.pel(m) < p) lo = m; else hi = m; } return (lo + hi) / 2; }

  // Closed-form Vdot for a prescribed driving pressure dP = Pao - Pel - Pvisco + Pmus (no algebraic loop).
  flowFromDP(dP) {
    const k1 = this.k1, k2 = this.k2, q = this.pt.qmax * (1 + 0.5 * Math.max(0, this.s.V)); // max flow rises with lung volume [ASSUMPTION]
    if (dP < 0 && q > 0) return -q * Math.tanh(-dP / (k1 * q)); // COPD expiratory flow limitation [ASSUMPTION form]
    const a = Math.abs(dP);
    const f = k2 > 1e-9 ? (-k1 + Math.sqrt(k1 * k1 + 4 * k2 * a)) / (2 * k2) : a / k1;
    return dP < 0 ? -f : f;
  }

  _rand() { this.s.seed = (this.s.seed * 1664525 + 1013904223) % 4294967296; return this.s.seed / 4294967296; }

  _effort(dt) {
    const s = this.s, d = this.pt.drive;
    if (d.rate <= 0 || d.pmax <= 0) { s.pmus = 0; s.eff = null; return; }
    if (!s.eff) {
      s.pmus = 0; s.nextEff -= dt;
      if (s.nextEff <= 0) s.eff = { t: 0, trig: false, ex: s.ph === 'exp' };
      return;
    }
    s.eff.t += dt;
    const x = s.eff.t / d.tn;
    if (x >= 1) {
      if (s.eff.ex) { this.efforts.push(s.eff.trig); if (this.efforts.length > 10) this.efforts.shift(); }
      s.eff = null; s.pmus = 0;
      s.nextEff = Math.max(0.1, (60 / d.rate) * (0.94 + 0.12 * this._rand()) - d.tn);
    } else s.pmus = d.pmax * Math.sin(Math.PI * x);
  }

  _vcFlow(t) {
    const st = this.set, vt = st.vt / 1000;
    return st.flow === 'decel' ? (1.3333 * vt / st.ti) * (1 - 0.5 * t / st.ti) : vt / st.ti;
  }

  _pLevel() { const st = this.set; return st.mode === 'PSV' ? st.ps : st.mode === 'APV' ? this.s.apvP : st.pc; }

  step() {
    const s = this.s, st = this.set, pt = this.pt;
    this._effort(DT);
    const k1 = this.k1, k2 = this.k2;
    const pel = this.pel(s.V) + s.pv;
    let vdot = 0, pao = st.peep;
    s.tPh += DT; s.tBr += DT; s.t += DT;

    if (s.ph === 'insp') {
      if (st.mode === 'VC') { vdot = this._vcFlow(s.tPh); pao = pel + k1 * vdot + k2 * vdot * Math.abs(vdot) - s.pmus; }
      else {
        pao = st.peep + this._pLevel() * Math.min(1, s.tPh / Math.max(st.rise, 0.02));
        vdot = this.flowFromDP(pao - pel + s.pmus);
      }
      if (vdot > s.peakFlow) s.peakFlow = vdot;
    } else if (s.ph === 'pause' || s.ph === 'ehold') { vdot = 0; pao = pel - s.pmus; }
    else { // exp. Waterfall: while flow-limited the airway collapses at pcrit, so PEEP below that does not slow emptying.
      pao = st.peep;
      vdot = this.flowFromDP(Math.max(st.peep, s.cp) - pel + s.pmus);
      if (pt.qmax > 0) s.cp += (pt.pcrit * Math.min(1, Math.abs(vdot) / (pt.qmax * (1 + 0.5 * Math.max(0, s.V)))) - s.cp) * (DT / 0.05);
    }

    s.V += vdot * DT;
    s.pv = (s.pv + (DT * vdot) / pt.cd) / (1 + DT / (pt.rd * pt.cd));
    s.vdot = vdot; s.pao = pao;
    const e = ETT[pt.ett];
    s.ptr = pao - pt.ettMult * (e.k1 * vdot + e.k2 * vdot * Math.abs(vdot)); // tracheal pressure

    const br = s.br;
    if (br) {
      br.pawSum += pao; br.cnt++;
      if (s.ph === 'insp') { if (vdot > 0) br.vti += vdot * DT; if (pao > br.pip) br.pip = pao; if (pao - st.peep < br.minRel) br.minRel = pao - st.peep; }
      else if (s.ph === 'exp' && vdot < 0) br.vte -= vdot * DT;
    }

    // phase logic
    if (s.ph === 'insp') {
      let cyc;
      if (st.mode === 'VC' || st.mode === 'PC' || st.mode === 'APV') cyc = s.tPh >= st.ti;
      else cyc = (s.tPh > 0.15 && vdot < (st.cycle / 100) * s.peakFlow) || s.tPh >= st.tiMax;
      if (cyc || pao > st.plimit) this._endInsp(pel);
    } else if (s.ph === 'pause') {
      if (s.tPh >= s.pauseDur) {
        this.hold = { pplat: pao, dur: s.pauseDur, t: s.t };
        s.ph = 'exp'; s.tPh = 0;
      }
    } else if (s.ph === 'ehold') {
      if (s.tPh >= st.holdDur) { this.ehold = { peepTot: pao, auto: Math.max(0, pao - st.peep), t: s.t }; this._startBreath(false, pel); }
    } else { // exp
      const timer = (st.mode === 'PSV' ? s.tBr >= st.apnea : s.tBr >= 60 / st.rr);
      const trig = s.tPh > 0.25 && vdot > st.trig / 60;
      if (trig || timer) {
        if (s.ehReq && !trig) { s.ehReq = false; s.ph = 'ehold'; s.tPh = 0; }
        else this._startBreath(trig, pel);
      }
    }

    if (++s.samp >= 10) { s.samp = 0; if (this.rec) this._sample(); }
    if (++s.tickN >= 500) { s.tickN = 0; this._tick1s(); }
  }

  _sample() {
    const s = this.s;
    this.out.push({ t: s.t, paw: s.pao, flow: s.vdot, vol: s.V - s.vStart, ptr: s.ptr, pmus: s.pmus, br: s.nBreath, ph: s.ph });
    if (this.out.length > 30000) this.out.splice(0, 10000);
  }

  _endInsp(pel) {
    const s = this.s, st = this.set;
    if (s.br) { s.br.pplat = pel; s.br.tI = s.tPh; s.br.peak = s.peakFlow; }
    if (st.mode === 'VC' && s.holdReq) { s.holdReq = false; s.ph = 'pause'; s.pauseDur = st.holdDur; }
    else s.ph = 'exp';
    s.tPh = 0;
  }

  _startBreath(trig, pelNow) {
    const s = this.s, st = this.set;
    if (s.br) this._finalize(pelNow);
    if (trig && s.eff) s.eff.trig = true;
    const dbl = trig && s.br && s.tPh < 0.6 && s.ph === 'exp';
    s.br = { n: ++s.nBreath, t: s.t, trig, dbl: !!dbl, vti: 0, vte: 0, pip: -1e9, minRel: 1e9, pawSum: 0, cnt: 0, pplat: 0, tI: 0, peak: 0 };
    s.ph = 'insp'; s.tPh = 0; s.tBr = 0; s.vStart = s.V; s.peakFlow = 0;
    this.starts.push(s.t); if (this.starts.length > 60) this.starts.shift();
  }

  _finalize(pelNow) {
    const s = this.s, st = this.set, pt = this.pt, b = s.br;
    const tTot = s.t - b.t;
    const peepTot = Math.max(st.peep, pelNow);
    const sum = {
      n: b.n, t: b.t, trig: b.trig, dbl: b.dbl, vti: b.vti, vte: b.vte, pip: b.pip, pplat: b.pplat,
      peepTot, autoPeep: Math.max(0, pelNow - st.peep), tI: b.tI, tE: tTot - b.tI, tTot,
      pmean: b.pawSum / Math.max(1, b.cnt), peak: b.peak, minRel: b.minRel,
    };
    this.last = sum; this.breaths.push(sum); if (this.breaths.length > 40) this.breaths.shift();
    // alveolar volume for gas exchange
    const vdA = pt.vdAnatPerKg * this.pbw;
    const vdFrac = this._vdAlv(sum.pplat);
    const alv = Math.max(0, sum.vti * 1000 - (vdA + vdFrac * Math.max(0, sum.vti * 1000 - vdA))) / 1000;
    this.alv.push({ t: s.t, v: alv });
    // APV: next breath pressure = target VT / dynamic compliance, step limited, bounded by plimit-10
    if (st.mode === 'APV' && sum.vti > 0.02) {
      const cdyn = sum.vti / Math.max(1, s.apvP);
      const want = (st.vt / 1000) / cdyn;
      s.apvP = clamp(s.apvP + clamp(want - s.apvP, -3, 3), 3, Math.max(5, st.plimit - 10 - st.peep));
    }
  }

  _vdAlv(pplat) { return clamp(this.pt.vdAlvFrac + 0.02 * Math.max(0, pplat - 30), 0, 0.9); }

  // ---------- slow physiology, once per simulated second ----------
  _vaNow() {
    const s = this.s;
    while (this.alv.length && this.alv[0].t < s.t - 60) this.alv.shift();
    const span = Math.min(60, s.t);
    return span > 2 ? (this.alv.reduce((a, x) => a + x.v, 0) / span) * 60 : 0;
  }

  _targets() {
    const st = this.set, pt = this.pt, g = this.g, l = this.last;
    const peepT = l ? l.peepTot : st.peep;
    const shunt = clamp(pt.shunt0 * (1 - pt.shuntRecruit * clamp((peepT - 5) / 12, 0, 1)) * (pt.shuntMult || 1), 0.01, 0.9);
    const hco3 = pt.hco3ref + 0.1 * (g.paco2 - pt.paco2ref);
    const ph = phHH(hco3, g.paco2);
    const pao2 = paO2FromShunt({ fio2: st.fio2, paco2: g.paco2, ph, hb: pt.hb, shunt, avdo2: pt.avdo2, vqDrop: pt.vq });
    // hemodynamics: intrathoracic pressure and auto-PEEP reduce venous return
    const pm = l ? l.pmean : st.peep, ap = l ? l.autoPeep : 0;
    const pen = pt.hemo.sens * (Math.max(0, pm - 8) * 1.0 + Math.max(0, ap - 2) * 1.5) + 40 * pt.tension;
    return { shunt, ph, hco3, pao2, map: Math.max(30, pt.hemo.map0 - pen), hr: Math.min(170, pt.hemo.hr0 + pen * 1.2) };
  }

  _tick1s() {
    const g = this.g, pt = this.pt;
    g.va = this._vaNow();
    // CO2 store: Cs dP/dt = VCO2 - 1.1587*VA*P  (P mmHg, VA L/min, VCO2 mL/min); Cs 60 mL/mmHg [ASSUMPTION] -> tau ~ 12 min
    if (this.s.t > 2) g.paco2 = clamp(g.paco2 + (pt.vco2 - 1.1587 * g.va * g.paco2) / 60 / 60, 5, 250);
    const T = this._targets();
    g.shunt = T.shunt;
    const a = (tau) => 1 - Math.exp(-1 / tau);
    g.pao2 += (T.pao2 - g.pao2) * a(15);
    const spT = 100 * satO2(g.pao2, T.ph);
    g.spo2 += (spT - g.spo2) * a(8);
    g.map += (T.map - g.map) * a(8);
    g.hr += (T.hr - g.hr) * a(8);
  }

  // Equilibrate to current settings (as if the patient had been ventilated for a while).
  settle() {
    const wasRec = this.rec; this.rec = false;
    this.run(90);
    const g = this.g, pt = this.pt;
    g.va = this._vaNow();
    g.paco2 = clamp(pt.vco2 / (1.1587 * Math.max(0.05, g.va)), 10, 250);
    const T = this._targets();
    g.pao2 = T.pao2; g.spo2 = 100 * satO2(g.pao2, T.ph); g.map = T.map; g.hr = T.hr;
    this.rec = wasRec; this.out.length = 0;
    return this;
  }

  run(sec) { const n = Math.round(sec / DT); for (let i = 0; i < n; i++) this.step(); }

  // ---------- readouts ----------
  abg() {
    const g = this.g, pt = this.pt, st = this.set;
    const hco3 = pt.hco3ref + 0.1 * (g.paco2 - pt.paco2ref), ph = phHH(hco3, g.paco2);
    return { t: this.s.t, ph, paco2: g.paco2, pao2: g.pao2, hco3, be: baseExcess(hco3, ph), sao2: 100 * satO2(g.pao2, ph),
      lactate: pt.lactate, fio2: st.fio2, pf: g.pao2 / st.fio2, aa: alveolarPO2(st.fio2, g.paco2) - g.pao2 };
  }

  rrTotal() { // mean of last 4 breath intervals
    const a = this.starts.slice(-5);
    return a.length < 2 ? 0 : (60 * (a.length - 1)) / (a[a.length - 1] - a[0]);
  }

  monitor() {
    const g = this.g, pt = this.pt, a = this.abg(), l = this.last;
    const pp = Math.max(15, 40 - (pt.hemo.map0 - g.map) * 0.3), sbp = g.map + (2 / 3) * pp, dbp = g.map - pp / 3;
    const etco2 = g.paco2 * (1 - this._vdAlv(l ? l.pplat : 0));
    return { hr: g.hr, sbp, dbp, map: g.map, spo2: g.spo2, rr: this.rrTotal(), etco2, temp: pt.temp, ph: a.ph };
  }

  recent(n = 5) { return this.breaths.slice(-n); }

  // Scalar metrics (means over last 5 breaths) used by scenario goals and the UI.
  metrics() {
    const r = this.recent(5), l = this.last, st = this.set, mon = this.monitor(), a = this.abg();
    const avg = (f) => (r.length ? r.reduce((x, b) => x + f(b), 0) / r.length : NaN);
    const vte = avg(b => b.vte) * 1000, rr = this.rrTotal();
    const pplat = avg(b => b.pplat), peepTot = avg(b => b.peepTot), pip = avg(b => b.pip);
    const eff = this.efforts;
    return {
      pip, pplat, peepTot, peepi: avg(b => b.autoPeep), gap: pip - pplat, dp: pplat - peepTot, pmean: avg(b => b.pmean),
      vte, vtPerKg: vte / this.pbw, mv: (vte * rr) / 1000, rr,
      rsbi: vte > 0 ? rr / (vte / 1000) : NaN,
      ineffPct: eff.length >= 5 ? (100 * eff.filter(x => !x).length) / eff.length : NaN,
      dblPct: r.length ? (100 * r.filter(b => b.dbl).length) / r.length : NaN,
      minRel: avg(b => b.minRel),
      map: mon.map, hr: mon.hr, spo2: mon.spo2, etco2: mon.etco2,
      ph: a.ph, paco2: a.paco2, pao2: a.pao2, pf: a.pf, hco3: a.hco3,
      cstat: l && this.hold ? (l.vti * 1000) / Math.max(0.1, this.hold.pplat - l.peepTot) : NaN,
    };
  }
}
