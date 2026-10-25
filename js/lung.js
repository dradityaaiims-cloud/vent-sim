// Animated lungs: size follows lung volume (exaggerated for visibility), colour follows elastic stress,
// trachea width follows airway + tube resistance, diaphragm follows volume and patient effort.
import { fit } from './draw.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

function lungPath(g, cx, cy, sx, sy, side) { // side -1 = viewer's left (patient's right)
  g.beginPath();
  g.moveTo(cx + side * 6 * sx, cy - 62 * sy);
  g.bezierCurveTo(cx + side * 20 * sx, cy - 48 * sy, cx + side * 78 * sx, cy - 40 * sy, cx + side * 74 * sx, cy + 6 * sy);
  g.bezierCurveTo(cx + side * 72 * sx, cy + 46 * sy, cx + side * 52 * sx, cy + 62 * sy, cx + side * 8 * sx, cy + 58 * sy);
  g.bezierCurveTo(cx + side * 2 * sx, cy + 20 * sy, cx + side * 2 * sx, cy - 30 * sy, cx + side * 6 * sx, cy - 62 * sy);
  g.closePath();
}

export function drawLung(canvas, sim) {
  const [g, w, h] = fit(canvas), s = sim.s, pt = sim.pt;
  const sc = Math.min(w / 220, h / 200), cx = w / 2, cy = h * 0.5;
  g.save(); g.translate(cx, cy); g.scale(sc, sc); g.translate(-cx, -cy);

  const V = Math.max(0, s.V), size = clamp(0.8 + 0.45 * V, 0.7, 1.5);
  const stress = clamp(sim.pel(s.V) / 40, 0, 1); // 0 blue .. 1 red
  const hue = 205 - 205 * stress;
  const eff = s.pmus > 0.5;
  const pneumo = pt.cMult < 0.6;

  // rib cage
  g.strokeStyle = '#3a4d63'; g.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const y = cy - 56 + i * 24, r = 96 + (i === 0 ? -22 : i === 4 ? -18 : 0);
    g.beginPath(); g.moveTo(cx - 8, y - 6); g.quadraticCurveTo(cx - r, y - 10, cx - r + 6, y + 22); g.moveTo(cx + 8, y - 6); g.quadraticCurveTo(cx + r, y - 10, cx + r - 6, y + 22); g.stroke();
  }
  // trachea: thinner when airway + tube resistance is high
  const tw = clamp(16 / (1 + sim.k1 / 12), 3, 14);
  g.strokeStyle = pt.ettMult > 2 ? '#d55e00' : '#9fb4c9'; g.lineWidth = tw; g.lineCap = 'round';
  g.beginPath(); g.moveTo(cx, cy - 92); g.lineTo(cx, cy - 46); g.stroke();
  g.lineWidth = Math.max(2, tw * 0.55); g.strokeStyle = '#9fb4c9';
  g.beginPath(); g.moveTo(cx, cy - 46); g.lineTo(cx - 14, cy - 30); g.moveTo(cx, cy - 46); g.lineTo(cx + 14, cy - 30); g.stroke();

  // lungs (viewer's left = patient's right; collapsed on that side in pneumothorax)
  const lung = (side, scale) => {
    const sx = size * scale, sy = size * (0.96 + 0.04 * scale), ox = cx + side * 6, oy = cy + 4 * (1 - scale);
    lungPath(g, ox, oy, sx * 0.62, sy * 0.78, side);
    g.fillStyle = `hsla(${hue},70%,45%,.82)`; g.fill(); g.strokeStyle = `hsl(${hue},80%,70%)`; g.lineWidth = 1.5; g.stroke();
  };
  lung(1, 1);
  if (pneumo) {
    g.fillStyle = '#0b0f14'; g.fillRect(cx - 78, cy - 62, 72, 120);
    lung(-1, 0.45);
    g.fillStyle = '#d55e00'; g.font = '11px system-ui'; g.textAlign = 'center'; g.fillText(pt.tension ? 'Tension pneumothorax' : 'Pneumothorax', cx - 44, cy - 66);
  } else lung(-1, 1);

  // diaphragm
  const dy = cy + 66 + 18 * clamp(V, 0, 1.2) - (eff ? 0 : 0);
  g.strokeStyle = eff ? '#ffd166' : '#6b7f95'; g.lineWidth = eff ? 4 : 3; g.lineCap = 'round';
  g.beginPath(); g.moveTo(cx - 92, dy - 10); g.quadraticCurveTo(cx, dy - 26 - (eff ? 8 : 0), cx + 92, dy - 10); g.stroke();
  g.restore();

  g.fillStyle = '#cfe8ff'; g.font = '12px system-ui'; g.textAlign = 'left';
  g.fillText(`Volume above relaxed ${(V * 1000).toFixed(0)} mL`, 8, h - 8);
  g.textAlign = 'right'; g.fillStyle = '#9fb4c9';
  g.fillText(`${s.ph === 'insp' || s.ph === 'pause' ? 'Inspiration' : s.ph === 'ehold' ? 'Hold' : 'Expiration'}${eff ? ' + patient effort' : ''}`, w - 8, h - 8);
  g.textAlign = 'left'; g.font = '10px system-ui'; g.fillStyle = '#7d8ea3';
  g.fillText('Size exaggerated. Colour = stress.', 8, 12);
}
