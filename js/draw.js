// Canvas helpers shared by the simulator and the Learn gallery.
const css = getComputedStyle(document.documentElement);
export const col = (n) => css.getPropertyValue(n).trim();
export const range = (a, b, s) => { const r = []; for (let x = a; x <= b + 1e-9; x += s) r.push(x); return r; };

export function fit(c) {
  const d = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
  if (c.width !== Math.round(w * d) || c.height !== Math.round(h * d)) { c.width = Math.round(w * d); c.height = Math.round(h * d); }
  const g = c.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, w, h);
  return [g, w, h];
}

export function lane(g, x0, y0, w, h, ymin, ymax, color, label, pts, ticks, fmt) {
  g.save(); g.beginPath(); g.rect(x0, y0, w, h); g.clip();
  g.strokeStyle = '#1b2a3a'; g.fillStyle = '#7d8ea3'; g.font = '11px system-ui'; g.lineWidth = 1;
  const Y = (v) => y0 + h - ((v - ymin) / (ymax - ymin)) * h;
  for (const t of ticks) { g.beginPath(); g.moveTo(x0, Y(t)); g.lineTo(x0 + w, Y(t)); g.stroke(); g.fillText(fmt(t), x0 + 4, Y(t) - 2); }
  g.fillStyle = color; g.fillText(label, x0 + 40, y0 + 12);
  g.strokeStyle = color; g.lineWidth = 2; g.beginPath();
  pts.forEach(([x, v], i) => (i ? g.lineTo(x, Y(v)) : g.moveTo(x, Y(v)))); g.stroke(); g.restore();
}

// Pressure + flow (+ optional volume) strip from engine samples. Used by the Learn gallery.
export function drawStrip(c, samples, { seconds = 12, volume = false } = {}) {
  const [g, w, h] = fit(c); if (!samples.length) return;
  const t1 = samples[samples.length - 1].t, vis = samples.filter((s) => s.t > t1 - seconds), X = (t) => ((t - (t1 - seconds)) / seconds) * w;
  const n = volume ? 3 : 2, lh = h / n;
  const pmax = Math.max(30, Math.ceil((Math.max(...vis.map((s) => s.paw)) + 2) / 10) * 10);
  const fmx = Math.max(60, Math.ceil(Math.max(...vis.map((s) => Math.abs(s.flow * 60))) / 30) * 30);
  lane(g, 0, 0, w, lh, -5, pmax, col('--p'), 'Paw (cmH2O)', vis.map((s) => [X(s.t), s.paw]), range(0, pmax, 10), (t) => t);
  lane(g, 0, lh, w, lh, -fmx, fmx, col('--f'), 'Flow (L/min)', vis.map((s) => [X(s.t), s.flow * 60]), [-fmx / 2, 0, fmx / 2], (t) => t.toFixed(0));
  if (volume) lane(g, 0, 2 * lh, w, lh, 0, 1000, col('--v'), 'Volume (mL)', vis.map((s) => [X(s.t), Math.max(0, s.vol * 1000)]), [0, 500], (t) => t);
}
