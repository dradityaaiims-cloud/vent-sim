import { CONFIG, mailto } from './config.js';

const ME = {
  name: 'Aditya Singh, MD',
  bio: [
    'I am an internal medicine resident with an interest in pulmonary and critical care medicine and in medical education. I build free interactive web apps and write about health and medical education.',
    'I made this simulator so that trainees can see, on a screen, what the numbers and waveforms on a ventilator mean, and practise troubleshooting without any risk to a patient.',
  ],
  links: [
    ['LinkedIn', 'https://www.linkedin.com/in/drsinghaditya03/'],
    ['Linktree (all my links)', 'https://linktr.ee/aditya.md'],
    ['Google Scholar', 'https://scholar.google.com/citations?hl=en&user=-EqF9yEAAAAJ'],
    ['Articles on KevinMD', 'https://kevinmd.com/post-author/aditya-singh'],
    ['Writing on Medium', 'https://medium.com/@draditya.aiims'],
  ],
  apps: [
    ['Robotic bronchoscopy simulator', 'https://dradityaaiims-cloud.github.io/bronchoscopy-sim/'],
    ['Right heart catheterization simulator', 'https://dradityaaiims-cloud.github.io/rhc-sim/'],
  ],
};

const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const a = (href, text) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;

function citations() {
  const url = location.origin + location.pathname.replace(/index\.html$/, '');
  const doi = CONFIG.doi ? `https://doi.org/${CONFIG.doi}` : '';
  const where = doi || url;
  const title = "Dr. Singh's Vent Sim: an open educational mechanical ventilator simulator";
  return {
    apa: `Singh, A. (${CONFIG.year}). <i>${esc(title)}</i> (Version ${CONFIG.version}) [Computer software]. ${esc(where)}`,
    apaText: `Singh, A. (${CONFIG.year}). ${title} (Version ${CONFIG.version}) [Computer software]. ${where}`,
    bib: `@software{singh_ventsim_${CONFIG.year},\n  author  = {Singh, Aditya},\n  title   = {${title}},\n  year    = {${CONFIG.year}},\n  version = {${CONFIG.version}},\n  url     = {${url}}${CONFIG.doi ? `,\n  doi     = {${CONFIG.doi}}` : ''}\n}`,
  };
}

export function renderAbout(box) {
  const c = citations();
  box.innerHTML = `<div class="prose">
<h2>About</h2>
<img class="headshot" src="assets/headshot.jpg" alt="Portrait of ${esc(ME.name)}" width="140" height="140">
<h3>${esc(ME.name)}</h3>
${ME.bio.map((p) => `<p>${esc(p)}</p>`).join('')}

<h3>Find me</h3>
<ul>${ME.links.map(([t, u]) => `<li>${a(u, t)}</li>`).join('')}</ul>
<h3>More apps by me</h3>
<ul>${ME.apps.map(([t, u]) => `<li>${a(u, t)}</li>`).join('')}</ul>

<h3>Contact, feedback and bug reports</h3>
<p>Questions, ideas, corrections and bug reports are welcome. For bugs, please say which lung type, mode, case number and browser you were using.</p>
<div class="btns">
  <a class="btnlink primary" id="fb-link" target="_blank" rel="noopener noreferrer">Give feedback / report a bug</a>
  <a class="btnlink" id="mail-link">Email me</a>
</div>

<h3>Cite this tool</h3>
<p>If you use this simulator in teaching or in a publication, please cite it.${CONFIG.doi ? '' : ' A DOI will be added once a release is archived.'}</p>
<p><b>APA</b></p><pre class="cite" id="cite-apa">${c.apa}</pre><button data-copy="apa">Copy APA</button>
<p><b>BibTeX</b></p><pre class="cite" id="cite-bib">${esc(c.bib)}</pre><button data-copy="bib">Copy BibTeX</button>
<p class="muted">A machine-readable <code>CITATION.cff</code> is included in the repository.</p>

<h3>Disclosures</h3>
<ul>
<li><b>Purpose.</b> Educational use only. This is not a medical device and must not be used for clinical decisions, assessment or exams. All values are simulated. Never enter patient information into any part of this site.</li>
<li><b>Manufacturers.</b> Not affiliated with or endorsed by any ventilator manufacturer. Mode names are generic, the screen layout follows common bedside ventilator conventions, and no manufacturer's algorithm is reproduced.</li>
<li><b>Funding and conflicts of interest.</b> None declared.</li>
<li><b>Software development.</b> The software was developed with AI coding assistance (Claude, by Anthropic), directed by the author, and is covered by automated tests of the physics and scenarios.</li>
<li><b>Views.</b> The views here are my own and do not represent my employer or training program.</li>
<li><b>Licence.</b> The software is open source under the MIT licence. The teaching content (Learn tab, cases, quiz and survey materials) is available under Creative Commons Attribution 4.0 (CC BY 4.0). Please credit and cite as below.</li>
</ul>

<h3>Privacy</h3>
<p>The simulator runs entirely in your browser. Progress is saved only in your browser's local storage. ${CONFIG.cfToken ? 'This site uses Cloudflare Web Analytics to count page views and approximate unique visitors. It sets no cookies and does not track you across sites.' : 'This site does not use analytics.'} If you send feedback through the form or by email, I receive what you type, and your email address if you give it. Please do not include anything identifying a patient.</p>
</div>`;
  const fb = box.querySelector('#fb-link');
  fb.href = CONFIG.feedbackUrl || mailto("Vent Sim feedback / bug report");
  if (!CONFIG.feedbackUrl) fb.removeAttribute('target');
  box.querySelector('#mail-link').href = mailto('Vent Sim');
  box.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    const text = b.dataset.copy === 'apa' ? c.apaText : c.bib;
    try { await navigator.clipboard.writeText(text); b.textContent = 'Copied'; } catch { prompt('Copy this citation', text); }
    setTimeout(() => { b.textContent = b.dataset.copy === 'apa' ? 'Copy APA' : 'Copy BibTeX'; }, 1500);
  }));
}
