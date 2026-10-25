// Guided tour: dims the page, outlines one element at a time, and explains it. Keyboard: arrows, Enter, Escape.
const $ = (s) => document.querySelector(s);

export function startTour(steps, onEnd = () => {}) {
  // keep only steps whose target is on screen (for example the patient bar is hidden inside a scenario)
  const live = steps.filter((s) => { const el = typeof s.el === 'function' ? s.el() : $(s.sel); return el && el.getBoundingClientRect().width > 0; });
  if (!live.length) return onEnd();
  let i = 0;
  const mask = document.createElement('div'); mask.className = 'tour-mask';
  const hole = document.createElement('div'); hole.className = 'tour-hole';
  const card = document.createElement('div'); card.className = 'tour-card'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-live', 'polite');
  document.body.append(mask, hole, card);

  const end = () => { document.removeEventListener('keydown', key); window.removeEventListener('resize', place); mask.remove(); hole.remove(); card.remove(); onEnd(); };
  const go = (d) => { i += d; if (i >= live.length) return end(); if (i < 0) i = 0; render(); };
  const key = (e) => { if (e.key === 'Escape') end(); else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); go(1); } else if (e.key === 'ArrowLeft') go(-1); };
  document.addEventListener('keydown', key); window.addEventListener('resize', place);

  function render() {
    const s = live[i], last = i === live.length - 1;
    card.innerHTML = `<div class="tour-n">${i + 1} of ${live.length}</div><h3>${s.title}</h3><p>${s.text}</p>
      <div class="tour-btns"><button data-a="skip" class="tour-skip">Skip tour</button><span class="grow"></span>${i ? '<button data-a="back">Back</button>' : ''}<button data-a="next" class="primary">${last ? 'Start using it' : 'Next'}</button></div>`;
    card.querySelector('[data-a=next]').onclick = () => go(1);
    const b = card.querySelector('[data-a=back]'); if (b) b.onclick = () => go(-1);
    card.querySelector('[data-a=skip]').onclick = end;
    card.querySelector('[data-a=next]').focus();
    place();
  }
  function place() {
    const s = live[i], el = typeof s.el === 'function' ? s.el() : $(s.sel); if (!el) return;
    const r = el.getBoundingClientRect(), pad = 4;
    Object.assign(hole.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + 2 * pad + 'px', height: r.height + 2 * pad + 'px' });
    const cw = Math.min(340, innerWidth - 24), ch = card.offsetHeight || 170, m = 12;
    let x, y, pos = s.pos || 'below';
    if (pos === 'right' && r.right + m + cw > innerWidth) pos = 'below';
    if (pos === 'left' && r.left - m - cw < 0) pos = 'below';
    if (pos === 'below' && r.bottom + m + ch > innerHeight) pos = r.top - m - ch > 0 ? 'above' : 'inside';
    if (pos === 'right') { x = r.right + m; y = r.top + 8; }
    else if (pos === 'left') { x = r.left - m - cw; y = r.top + 8; }
    else if (pos === 'above') { x = r.left; y = r.top - m - ch; }
    else if (pos === 'inside') { x = r.left + 16; y = r.top + 16; }
    else { x = r.left; y = r.bottom + m; }
    card.style.width = cw + 'px';
    card.style.left = Math.max(12, Math.min(x, innerWidth - cw - 12)) + 'px';
    card.style.top = Math.max(12, Math.min(y, innerHeight - ch - 12)) + 'px';
  }
  render();
}
