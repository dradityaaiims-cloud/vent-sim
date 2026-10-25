// Exports waveform samples for the manuscript gallery figure. Run: node scripts/export-gallery.mjs
import fs from 'node:fs';
import { Sim } from '../js/engine/engine.js';
import { ASYN } from '../js/asyn.js';

const cases = [
  { title: 'Volume control, square flow', key: 'normal', mods: {}, set: { mode: 'VC', vt: 450, rr: 14, ti: 1.0, flow: 'square' } },
  { title: 'Volume control with inspiratory hold', key: 'normal', mods: {}, set: { mode: 'VC', vt: 450, rr: 14, ti: 1.0, flow: 'square', holdDur: 2 }, hold: true },
  ...ASYN.map((a) => ({ title: a.title, key: a.key, mods: a.mods, set: a.set })),
];
const out = cases.map((c) => {
  const s = new Sim(c.key, c.mods, c.set); s.rec = false; s.run(60); s.rec = true; s.out.length = 0;
  if (c.hold) s.s.holdReq = true;
  s.run(16);
  const o = s.out, t0 = o[0].t, peep = s.set.peep, trig = [];
  o.forEach((x, i) => { if (x.trig && (!i || o[i - 1].br !== x.br)) trig.push(x.t - t0); });
  return { title: c.title, peep, t: o.map((x) => +(x.t - t0).toFixed(3)), paw: o.map((x) => +x.paw.toFixed(2)), flow: o.map((x) => +(x.flow * 60).toFixed(1)), pmus: o.map((x) => +x.pmus.toFixed(2)), trig };
});
fs.writeFileSync('docs/publication/figures/gallery.json', JSON.stringify(out));
console.log(out.map((c) => `${c.title}: ${c.t.length} samples, ${c.trig.length} triggers`).join('\n'));
