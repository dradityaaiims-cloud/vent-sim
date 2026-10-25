// Boba, the assistant dog: bottom-right, animated, gives context-aware hints. Rules live in boba-rules.js.
import { nextRule, GENERAL } from './boba-rules.js';

export function initBoba({ getCtx, onTour, onLearn, onHint }) {
  const KEY = 'vsim-boba-quiet';
  let quiet = false; try { quiet = localStorage.getItem(KEY) === '1'; } catch { /* private mode */ }
  const fired = new Map(); let lastProactive = Date.now() - 30e3, generalIdx = Math.floor(Math.random() * GENERAL.length);
  let hideTimer = null, lastActive = Date.now(), asleep = false;

  const root = document.createElement('div'); root.id = 'boba'; root.className = 'boba';
  root.innerHTML = `
    <div class="boba-bubble" role="status" aria-live="polite" hidden>
      <button class="boba-x" aria-label="Close tip">x</button>
      <div class="boba-text"></div>
      <div class="boba-btns"></div>
    </div>
    <button class="boba-dog" aria-label="Boba, your assistant dog. Press for a tip." title="Click me for a tip. Double-click for zoomies.">
      <img src="assets/boba.webp" alt="" width="96" height="96" draggable="false">
      <span class="boba-zzz" aria-hidden="true">z z z</span>
    </button>`;
  document.body.append(root);
  const bubble = root.querySelector('.boba-bubble'), text = root.querySelector('.boba-text'), btns = root.querySelector('.boba-btns');
  const dog = root.querySelector('.boba-dog'), img = root.querySelector('img');

  const anim = (cls, ms) => { dog.classList.remove('wag', 'hop', 'zoom'); void dog.offsetWidth; dog.classList.add(cls); setTimeout(() => dog.classList.remove(cls), ms); };
  const wake = () => { lastActive = Date.now(); if (asleep) { asleep = false; dog.classList.remove('nap'); say('Woof! I\'m awake.', [], 3000); anim('hop', 500); } };

  function say(msg, extras = [], autoHide = 0) {
    text.textContent = msg; btns.replaceChildren();
    const mk = (label, fn, cls = '') => { const b = document.createElement('button'); b.textContent = label; if (cls) b.className = cls; b.onclick = (e) => { e.stopPropagation(); fn(); }; btns.append(b); };
    for (const [label, fn, cls] of extras) mk(label, fn, cls);
    mk('Another tip', () => tip(true));
    mk('Tour', () => { close(); onTour(); });
    mk(quiet ? 'Unmute' : 'Hush', () => { quiet = !quiet; try { localStorage.setItem(KEY, quiet ? '1' : '0'); } catch { /* */ } say(quiet ? 'Okay, I will stay quiet. Click me any time.' : 'Yay! I will chime in when I notice something.', [], 4000); });
    bubble.hidden = false; anim('wag', 900);
    clearTimeout(hideTimer); if (autoHide) hideTimer = setTimeout(close, autoHide);
  }
  function close() { bubble.hidden = true; clearTimeout(hideTimer); }

  // a tip for the current situation if one applies, otherwise the next general tip
  function tip(forceNew = false) {
    const ctx = getCtx(), now = Date.now();
    const r = nextRule(ctx, forceNew ? new Map() : fired, now);
    if (r) { fired.set(r.id, now); return say(r.text(ctx), r.offerHint ? [[`Hint (-${ctx.scn.hintCost})`, () => { const h = onHint(); if (h) say(h, [], 0); }, 'primary']] : []); }
    generalIdx = (generalIdx + 1) % GENERAL.length; say(GENERAL[generalIdx]);
  }

  dog.addEventListener('click', () => { wake(); bubble.hidden ? tip(true) : close(); });
  dog.addEventListener('dblclick', () => { anim('zoom', 1400); say('Zoomies!', [], 2500); });
  root.querySelector('.boba-x').onclick = close;
  for (const ev of ['mousemove', 'keydown', 'pointerdown']) window.addEventListener(ev, () => { if (asleep) wake(); lastActive = Date.now(); }, { passive: true });

  // proactive hints, napping and idle antics
  setInterval(() => {
    const now = Date.now();
    if (document.querySelector('.tour-card') || document.querySelector('dialog[open]')) return;
    if (!asleep && now - lastActive > 180e3) { asleep = true; dog.classList.add('nap'); close(); return; }
    if (asleep) return;
    if (!quiet && bubble.hidden && now - lastProactive > 40e3) {
      const ctx = getCtx(), r = nextRule(ctx, fired, now);
      if (r) { fired.set(r.id, now); lastProactive = now; say(r.text(ctx), r.offerHint ? [[`Hint (-${ctx.scn.hintCost})`, () => { const h = onHint(); if (h) say(h, [], 0); }, 'primary']] : [], 16000); return; }
    }
    if (bubble.hidden && Math.random() < 0.18) anim(Math.random() < 0.6 ? 'wag' : 'hop', 900);
  }, 4000);

  // greet a new visitor once
  setTimeout(() => say('Hi, I\'m Boba! Click me for tips, or ask for the tour. I\'ll chime in when I notice something.', [['Show me around', () => { close(); onTour(); }, 'primary']], 12000), 2500);
  return { say, tip };
}
