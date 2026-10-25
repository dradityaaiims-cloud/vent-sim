// Patient presets. Units: L, cmH2O, s. Tags follow copd-ards-parameter-sheet.md:
// [SRC] cited, [CALC] derived, [ASSUMPTION] needs clinical review. reviewed:false until Dr. Singh signs off.
export const BASE = {
  sex: 'M', height: 175, weight: 75,
  ccw: 0.2,            // chest wall compliance [ASSUMPTION, van Diepen 2026 Table 4]
  ett: 8, ettMult: 1,  // ETT size mm; ettMult = kink/secretion multiplier on tube K1,K2
  cMult: 1,            // lung compliance multiplier (pneumothorax / mainstem)
  tension: 0,          // 0..1 tension physiology -> venous return loss
  k2aw: 0,
  cd: 0.4, rd: 4,      // viscoelastic [SRC] van Diepen 2026 Table 4 (post-cardiac-surgery, not disease specific)
  qmax: 0, pcrit: 0,   // expiratory flow limit L/s (0 = none); airway collapse pressure cmH2O
  hb: 14, avdo2: 5, vdAnatPerKg: 2.2, // mL per kg PBW [ASSUMPTION]
  vco2: 200,           // mL/min [ASSUMPTION]
  lactate: 1.0,
  drive: { rate: 0, pmax: 0, tn: 1.0 }, // patient effort: efforts/min, peak Pmus cmH2O, neural Ti s
  hemo: { map0: 85, hr0: 75, sens: 1 },
  temp: 37,
  reviewed: false,
};

export const PRESETS = {
  normal: {
    ...BASE, label: 'Normal',
    cl: 0.086,               // Crs = 0.06 L/cmH2O with Ccw 0.2 [ASSUMPTION, sheet sec 4]
    k1aw: 2.5,
    vdAlvFrac: 0.05, shunt0: 0.04, shuntRecruit: 0, vq: 0,
    hco3ref: 24, paco2ref: 40, vco2: 180, // sedated ventilated adult [ASSUMPTION]
  },
  copd: {
    ...BASE, label: 'COPD', sex: 'M', height: 165, weight: 65,
    cl: 0.0817,              // [CALC] lung C from Crs 58 mL/cmH2O in series with Ccw 0.2 (Annals Intensive Care 2021)
    k1aw: 25.7,              // [SRC] Rrs 27 incl. ETT 8 mm (1.28)
    qmax: 0.16,              // [CALC] sheet Q2 option (b): wider margin; qmax 0.10 reproduces the cohort means (PIP 36, Pplat 18, PEEPi 9)
    pcrit: 6,                // [ASSUMPTION] waterfall collapse pressure; lets PEEP < pcrit leave total PEEP unchanged
    vdAlvFrac: 0.4,          // [ASSUMPTION] VD/VT ~0.58
    shunt0: 0.07, shuntRecruit: 0, vq: 12, // [ASSUMPTION] V/Q mismatch via PAO2 drop
    hco3ref: 31, paco2ref: 65, // [SRC] chronic compensation, cohort pH 7.30 / PaCO2 65 / HCO3 31
    vco2: 200,
  },
  ards: {
    ...BASE, label: 'ARDS (moderate)', sex: 'F', height: 165, weight: 70,
    ven: { a: 0.3, b: 1.5, c: 18, d: 9 }, // Venegas sigmoid [ASSUMPTION, sheet sec 3.2: no published a/b/c/d]
    ccw: 0.15,               // [SRC] 148 +/- 78 mL/cmH2O
    k1aw: 4,
    cd: 0.3, rd: 3,
    vdAlvFrac: 0.35,         // VD/VT ~0.6 [SRC Nuckton 2002]
    shunt0: 0.30, shuntRecruit: 0.5, vq: 0, avdo2: 4, // shunt [SRC COVID series], recruit [ASSUMPTION]
    hco3ref: 22, paco2ref: 40, vco2: 230, hb: 11,
    hemo: { map0: 80, hr0: 90, sens: 1.2 },
    temp: 38,
  },
};
