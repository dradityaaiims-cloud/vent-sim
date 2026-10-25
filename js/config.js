// Site settings you may edit. Nothing here is secret: a Cloudflare Web Analytics token and a Google Form link are public by design.
export const CONFIG = {
  version: '0.2.0',
  year: 2026,
  // Cloudflare dashboard > Analytics & Logs > Web Analytics > Add a site > copy the "token" from the snippet. Empty = analytics off.
  cfToken: '',
  // Public link of your Google Form (Send > link icon). Empty = the Feedback buttons fall back to email.
  feedbackUrl: 'https://forms.gle/VdCnVF6TfKWQFiRR7',
  // Contact email, split so it is not plain text in the page source (reduces scraping). Change to your routed address later.
  emailUser: 'draditya.aiims',
  emailDomain: 'gmail.com',
  // Add after you publish a release on Zenodo (https://zenodo.org links your GitHub repo and mints a DOI). Format: 10.5281/zenodo.1234567
  doi: '',
  repoUrl: 'https://github.com/dradityaaiims-cloud/vent-sim',
};
export const mailto = (subject = '') => `mailto:${CONFIG.emailUser}@${CONFIG.emailDomain}${subject ? '?subject=' + encodeURIComponent(subject) : ''}`;
