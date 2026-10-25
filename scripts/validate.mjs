// Technical validation experiments. Run: node scripts/validate.mjs
// Writes docs/publication/validation/results.json and results.md. Pure engine, no browser.
import fs from 'node:fs';
import { Sim, ETT } from '../js/engine/engine.js';
import { alveolarPO2, phHH, hco3HH, paO2FromShunt, satO2 } from '../js/engine/gas.js';
import { SCENARIOS, evalGoals, loadScenario } from '../js/scenarios.js';

const out = {}; const q = (s) => { s.rec = false; return s; };

// 1. Linear limit: expiration is exponential with tau = R*C
{
  const s = q(new Sim('normal', { ettMult: 0, k2aw: 0, cd: 1e9 }, { peep: 0, mode: 'PSV', apnea: 1e9, rr: 1 }));
  const C = 1 / (1 / s.pt.cl + 1 / s.pt.ccw), R = s.k1, tau = R * C;
  s.s.V = 0.5; s.s.pv = 0; s.s.ph = 'exp'; s.s.tPh = 0; s.s.tBr = 0;
  const t = [], v = [], model = []; let maxErr = 0;
  for (let i = 0; i <= 3 * tau / 0.05; i++) {
    const tt = i * 0.05; t.push(tt); v.push(s.s.V * 1000); const m = 500 * Math.exp(-tt / tau); model.push(m);
    maxErr = Math.max(maxErr, Math.abs(s.s.V * 1000 - m)); s.run(0.05);
  }
  out.linearLimit = { tau, R, C, maxAbsErr_mL: maxErr, t, v, model };
}

// 2. Closed-form flow vs numerical root finder
{
  const s = q(new Sim('normal')); s.s.V = 0.2; let maxErr = 0;
  for (let dP = -10; dP <= 50; dP += 0.5) {
    const f = s.flowFromDP(dP); let lo = -5, hi = 5;
    const drop = (x) => s.k1 * x + s.k2 * x * Math.abs(x);
    for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (drop(m) < dP) lo = m; else hi = m; }
    maxErr = Math.max(maxErr, Math.abs(f - lo));
  }
  out.closedForm = { maxAbsErr_Ls: maxErr };
}

// 3. Tube pressure drop at 1 L/s (analytic: K1 + K2)
out.tubeDrop = Object.fromEntries(Object.entries(ETT).map(([mm, c]) => [mm + ' mm', c.k1 + c.k2]));

// 4. Reference patient and gas equations
{
  const ref = (fio2) => { const s = q(new Sim('normal', {}, { vt: 450, rr: 14, peep: 5, fio2 })).settle(); const a = s.abg(); return { fio2, ph: a.ph, paco2: a.paco2, pao2: a.pao2, hco3: a.hco3 }; };
  out.reference = { onRoomAir: ref(0.21), on40: ref(0.4) };
  const base = { fio2: 0.21, paco2: 40, ph: 7.4, hb: 14, avdo2: 5 };
  out.gasEquations = { PAO2_room_air: alveolarPO2(0.21, 40), PaO2_shunt0: paO2FromShunt({ ...base, shunt: 0 }), PaO2_shunt30: paO2FromShunt({ ...base, shunt: 0.3 }), P50_sat: satO2(26.8), hhRoundTrip: hco3HH(phHH(24, 40), 40) };
}

// 5. COPD cohort comparison (Annals of Intensive Care 2021, 16 patients, ZEEP, VT 438, RR 15, Ti 0.7)
{
  const rows = [];
  for (const qm of [0.08, 0.09, 0.10, 0.11, 0.12, 0.14, 0.16]) {
    const s = q(new Sim('copd', { qmax: qm }, { vt: 430, rr: 15, peep: 0, ti: 0.7 })); s.run(200); const m = s.metrics();
    rows.push({ qmax: qm, pip: m.pip, pplat: m.pplat, peepi: m.peepi, map: m.map });
  }
  out.cohort = { published: { pip: 35, pplat: 18, peepi: 9, rangePip: [19, 47], rangePplat: [10, 24], rangePeepi: [3, 14] }, rows };
}

// 6. Waterfall: total PEEP vs set PEEP when flow limited
{
  const rows = [];
  for (const peep of [0, 2, 4, 6, 8, 10, 12]) {
    const s = q(new Sim('copd', { qmax: 0.10 }, { vt: 430, rr: 15, peep, ti: 0.7 })); s.run(200); const m = s.metrics();
    rows.push({ peep, peepTot: m.peepTot, autoPeep: m.peepi });
  }
  out.waterfall = rows;
}

// 7. APV convergence after a compliance step (breaths are identified by number, the engine keeps only the last 40)
{
  const s = q(new Sim('normal', {}, { mode: 'APV', vt: 450, rr: 14, ti: 1.0 })); s.run(120);
  const nb = s.s.nBreath; s.patch({ cMult: 0.5 }); s.run(25 * 60 / 14);
  const br = s.breaths.filter((b) => b.n > nb + 1); // first full breath after the step onwards
  out.apv = { target: 450, vte: br.map((b) => b.vte * 1000), pip: br.map((b) => b.pip) };
}

// 8. PaCO2 time course after halving the rate
{
  const s = q(new Sim('normal', {}, { vt: 450, rr: 14 })).settle(); const p0 = s.g.paco2; s.configure({ rr: 7 });
  const t = [0], pc = [p0];
  for (let m = 1; m <= 60; m++) { s.run(60); t.push(m); pc.push(s.g.paco2); }
  const pEnd = pc[pc.length - 1], target = p0 + 0.632 * (pEnd - p0); let tau = null;
  for (let i = 0; i < pc.length; i++) if (pc[i] >= target) { tau = t[i]; break; }
  out.paco2 = { t, paco2: pc, start: p0, end60: pEnd, timeTo63pct_min: tau };
}

// 9. Plateau pressure depends on hold duration (viscoelastic relaxation)
{
  const rows = [];
  for (const d of [0.25, 0.5, 1, 2, 3, 5]) {
    const s = q(new Sim('normal', {}, { vt: 500, rr: 10, ti: 0.8, holdDur: d })); s.run(8); s.s.holdReq = true; s.run(14);
    rows.push({ hold_s: d, pplat: s.hold.pplat });
  }
  out.holdDecay = { rows, tau_d: 4 * 0.4 };
}

// 10. Scenarios: start fails goals, correct fix passes
{
  const rows = [];
  for (const sc of SCENARIOS) {
    const sim = q(new Sim()); loadScenario(sc, sim);
    for (const e of sc.events || []) sim.patch(e.patch); if (sc.events) sim.settle();
    const startPass = evalGoals(sc.goals, sim).every((g) => g.ok);
    if (sc.solution.set) sim.configure(sc.solution.set);
    for (const id of sc.solution.actions || []) sim.patch(sc.actions.find((a) => a.id === id).patch);
    sim.settle(); const fixPass = evalGoals(sc.goals, sim).every((g) => g.ok);
    rows.push({ id: sc.id, title: sc.title, startMeetsGoals: startPass, fixMeetsGoals: fixPass });
  }
  out.scenarios = rows;
}

fs.writeFileSync('docs/publication/validation/results.json', JSON.stringify(out));
const f = (x, d = 1) => (typeof x === 'number' ? x.toFixed(d) : x);
const r = out.cohort.rows.find((x) => x.qmax === 0.10);
const md = `# Technical validation results (generated by scripts/validate.mjs)

Generated ${new Date().toISOString().slice(0, 10)}. Re-run with \`node scripts/validate.mjs\`.

| Check | Result |
|---|---|
| Linear-limit emptying vs exp(-t/tau), tau = ${f(out.linearLimit.tau, 3)} s | max absolute volume error ${f(out.linearLimit.maxAbsErr_mL, 2)} mL |
| Closed-form flow vs numerical root finder | max absolute error ${out.closedForm.maxAbsErr_Ls.toExponential(1)} L/s |
| Tube drop at 1 L/s (K1+K2): 7, 8, 9 mm | ${Object.values(out.tubeDrop).map((x) => f(x, 2)).join(', ')} cmH2O |
| Alveolar gas equation, room air, PaCO2 40 | PAO2 ${f(out.gasEquations.PAO2_room_air)} mmHg |
| Shunt equation: PaO2 at shunt 0 / 30% (room air) | ${f(out.gasEquations.PaO2_shunt0)} / ${f(out.gasEquations.PaO2_shunt30)} mmHg |
| Severinghaus saturation at P50 26.8 mmHg | ${f(out.gasEquations.P50_sat, 3)} |
| Reference patient (VT 450, RR 14, PEEP 5), FiO2 0.21 | pH ${f(out.reference.onRoomAir.ph, 2)}, PaCO2 ${f(out.reference.onRoomAir.paco2, 0)}, PaO2 ${f(out.reference.onRoomAir.pao2, 0)} |
| Reference patient, FiO2 0.40 | pH ${f(out.reference.on40.ph, 2)}, PaCO2 ${f(out.reference.on40.paco2, 0)}, PaO2 ${f(out.reference.on40.pao2, 0)} |
| COPD vs published cohort (qmax 0.10): peak / plateau / auto-PEEP | ${f(r.pip, 0)} / ${f(r.pplat, 0)} / ${f(r.peepi, 1)} cmH2O vs 35 / 18 / 9 (calibrated: not independent) |
| Waterfall: total PEEP with set PEEP 0 vs 4 (flow limited) | ${f(out.waterfall[0].peepTot)} vs ${f(out.waterfall[2].peepTot)} cmH2O |
| Adaptive mode after halving compliance (target 450): exhaled VT at breath 1 / 5 / 10 | ${f(out.apv.vte[0], 0)} / ${f(out.apv.vte[4], 0)} / ${f(out.apv.vte[9], 0)} mL |
| PaCO2 after halving rate: start, at 60 min, time to 63% | ${f(out.paco2.start, 0)}, ${f(out.paco2.end60, 0)} mmHg, ${out.paco2.timeTo63pct_min} min |
| Plateau at hold 0.25 s vs 3 s | ${f(out.holdDecay.rows[0].pplat)} vs ${f(out.holdDecay.rows[4].pplat)} cmH2O |
| Scenarios where start meets goals / fix fails goals | ${out.scenarios.filter((x) => x.startMeetsGoals).length} / ${out.scenarios.filter((x) => !x.fixMeetsGoals).length} of ${out.scenarios.length} |

Not done: comparison with an independent physiology engine or published simulator output; clinical review.
`;
fs.writeFileSync('docs/publication/validation/results.md', md);
console.log(md);
