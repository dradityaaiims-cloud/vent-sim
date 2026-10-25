// Gas exchange helpers. Pure functions, no state.
export const PB = 760, PH2O = 47;

// Severinghaus 1979 oxyhemoglobin curve, Bohr shift 0.48 per pH unit (ASSUMPTION: standard textbook slope).
export const satO2 = (po2, ph = 7.4) => {
  const p = Math.max(0.01, po2) * Math.pow(10, 0.48 * (ph - 7.4));
  return 1 / (23400 / (p ** 3 + 150 * p) + 1);
};

// mL O2 / dL blood
export const contentO2 = (po2, ph, hb) => 1.34 * hb * satO2(po2, ph) + 0.003 * po2;

// Simplified alveolar gas equation (F factor omitted), RQ 0.8.
export const alveolarPO2 = (fio2, paco2, rq = 0.8) => fio2 * (PB - PH2O) - paco2 / rq;

// Shunt equation solved in closed form for CaO2, then inverted for PaO2 by bisection.
// CvO2 = CaO2 - avdo2  =>  CaO2 = CcO2 - avdo2 * Qs/(1-Qs)
export function paO2FromShunt({ fio2, paco2, ph, hb, shunt, avdo2 = 5, vqDrop = 0 }) {
  const pA = Math.max(1, alveolarPO2(fio2, paco2) - vqDrop);
  const ca = contentO2(pA, ph, hb) - (avdo2 * shunt) / (1 - shunt);
  let lo = 1, hi = pA;
  if (contentO2(lo, ph, hb) >= ca) return lo;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (contentO2(mid, ph, hb) < ca) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// Henderson-Hasselbalch
export const phHH = (hco3, paco2) => 6.1 + Math.log10(hco3 / (0.0307 * paco2));
export const hco3HH = (ph, paco2) => 0.0307 * paco2 * Math.pow(10, ph - 6.1);
// Van Slyke base excess approximation
export const baseExcess = (hco3, ph) => 0.93 * (hco3 - 24.4 + 14.8 * (ph - 7.4));
