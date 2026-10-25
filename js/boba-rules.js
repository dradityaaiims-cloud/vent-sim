// Boba's hints are plain rules over what the simulator is doing. No AI model, no network. Pure functions (testable in Node).
// ctx = { m: sim.metrics(), set, t, scn: {id,hints,done,goalsMet,hintCost,secs} | null, hasHold, hasEhold, abgCount, tab }
const f = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : '?');

export const RULES = [
  { id: 'goal', cool: 60e3, when: (c) => c.scn && c.scn.goalsMet && !c.scn.done, text: () => 'You have met every goal. Press Finish case to see your score.' },
  { id: 'autopeep', cool: 120e3, when: (c) => c.m.peepi > 5, text: (c) => `Woof! Flow isn't getting back to zero, so air is being trapped (auto-PEEP about ${f(c.m.peepi)} cmH2O). Give more time to breathe out: lower the rate or inspiratory time. Press Exp hold to measure it.` },
  { id: 'hypotension', cool: 120e3, when: (c) => c.t > 60 && c.m.map < 60, text: (c) => c.m.peepi > 5 ? `Blood pressure is low (MAP ${f(c.m.map)}) and auto-PEEP is ${f(c.m.peepi)}. Trapped air reduces venous return. Allow more expiratory time.` : c.m.pplat > 25 && c.m.gap < 8 ? `MAP ${f(c.m.map)} with high pressures: stiff lung or a tension pneumothorax? Look at both peak and plateau.` : `MAP is ${f(c.m.map)}. High mean airway pressure lowers blood pressure. Check PEEP, auto-PEEP and the whole patient.` },
  { id: 'hypoxemia', cool: 120e3, when: (c) => c.t > 60 && c.m.spo2 < 90, text: (c) => `SpO2 is ${f(c.m.spo2)}%. Raise FiO2, or raise PEEP in steps and watch plateau and blood pressure. In ARDS, prone helps.` },
  { id: 'plateau', cool: 120e3, when: (c) => c.m.pplat > 30, text: (c) => `Plateau is ${f(c.m.pplat)} cmH2O. The lung-protective goal is 30 or less. Lower the tidal volume toward 6 mL/kg of predicted body weight.` },
  { id: 'vt-high', cool: 180e3, when: (c) => (c.set.mode === 'VC' || c.set.mode === 'APV') && c.m.vtPerKg > 8.5, text: (c) => `Tidal volume is ${f(c.m.vtPerKg, 1)} mL/kg of predicted body weight. The usual target is 6 to 8. The Patient bar shows the range.` },
  { id: 'resistance', cool: 180e3, when: (c) => c.set.mode === 'VC' && c.m.gap > 12, text: (c) => `Peak is ${f(c.m.gap)} cmH2O above plateau. That gap is a resistance problem: secretions, a kinked or bitten tube, or bronchospasm.` },
  { id: 'acidosis', cool: 180e3, when: (c) => c.t > 120 && c.m.ph < 7.25, text: (c) => `pH is ${f(c.m.ph, 2)} with PaCO2 ${f(c.m.paco2)}. If this is from too little ventilation, raise the rate. CO2 takes about 20 minutes to settle: try the 20x speed in Tools.` },
  { id: 'alkalosis', cool: 180e3, when: (c) => c.t > 120 && c.m.ph > 7.5, text: (c) => `pH is ${f(c.m.ph, 2)}. Too much ventilation? Check the total rate, which can be above the set rate if the patient triggers.` },
  { id: 'double', cool: 180e3, when: (c) => c.m.dblPct >= 20, text: () => 'Two breaths are arriving back to back (double triggering). The patient\'s effort is longer than the ventilator\'s inspiratory time. Try a longer Ti or a mode where flow follows the patient.' },
  { id: 'ineffective', cool: 180e3, when: (c) => c.m.ineffPct >= 40, text: () => 'Some of the patient\'s efforts are not triggering a breath. Turn on Show Pmus to see them. Auto-PEEP is a common cause.' },
  { id: 'first-trigger', cool: 1e12, when: (c) => c.t > 20 && c.m.rr > 0 && c.hasTriggered, text: () => 'The pink triangle marks a breath the patient triggered. Tick Show Pmus to see the effort behind it.' },
  { id: 'try-hold', cool: 1e12, when: (c) => c.tab === 'sim' && c.t > 180 && !c.hasHold && c.set.mode === 'VC', text: () => 'Try Insp hold. It pauses at the end of inspiration so you can read plateau pressure and compliance.' },
  { id: 'try-abg', cool: 1e12, when: (c) => c.tab === 'sim' && c.t > 300 && c.abgCount === 0, text: () => 'Press Get ABG for a blood gas. Change a setting first and compare.' },
  { id: 'stuck', cool: 120e3, when: (c) => c.scn && !c.scn.done && c.scn.hints === 0 && c.scn.secs > 120, text: (c) => `Stuck? Compare peak and plateau, then think about what changed. I can give a hint (costs ${c.scn.hintCost} points).`, offerHint: true },
];

export const GENERAL = [
  'Tidal volume comes from predicted body weight (height and sex), not actual weight.',
  'Peak minus plateau tells you about resistance. Plateau minus PEEP tells you about compliance.',
  'If the flow trace does not reach zero before the next breath, air is being trapped.',
  'PaCO2 depends on minute ventilation. Halve it and PaCO2 doubles, over about 20 minutes.',
  'Hover over any number for a one-line explanation.',
  'Extrinsic PEEP only helps a flow-limited patient trigger. Otherwise it adds to hyperinflation.',
  'Driving pressure is plateau minus PEEP. Aim for under about 15.',
  'Open Examples to see common ventilator problems, such as reverse triggering.',
  'In pressure control the volume is the result. Watch the exhaled volume.',
  'Freeze the waveform, then click it to read exact values at one moment.',
  'Treat the patient, then the number. This is a simulation: check your local protocols.',
];

// Returns the first rule that applies and is not on cooldown; `fired` maps id -> last time (ms).
export function nextRule(ctx, fired, now) {
  for (const r of RULES) {
    if (now - (fired.get(r.id) ?? -Infinity) < r.cool) continue;
    let ok = false; try { ok = !!r.when(ctx); } catch { ok = false; }
    if (ok) return r;
  }
  return null;
}
