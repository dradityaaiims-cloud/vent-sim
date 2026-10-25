# Request for peer review: a free, open ventilator simulator for teaching

**Aditya Singh, MD** | draft shared for informal review | CC BY 4.0

## Short abstract
Trainees learn ventilator management from scattered bedside exposure, lectures and, where available, costly manikin simulation. We built a free, open-source, browser-based ventilator simulator with a physics-based patient (normal, COPD, asthma, ARDS), a ventilator-style screen with waveforms, loops and animated lungs, on-demand blood gases, 10 troubleshooting cases with hints and scoring, 7 patient-ventilator asynchrony examples, and a Learn section. It was built by a physician working with an AI coding assistant and deployed as a static website with automated tests, an open licence and a citable DOI. A companion manuscript describes the process from idea to deployment, the decisions and problems, the verification done, and a plan to test it with students. **The model is checked against analytic results and calibrated to one published COPD cohort. It has not been clinically reviewed, and no learner data exist yet.** That is why I am asking for your review.

## What I am asking you to look at (about 20 minutes)
1. **Try it** (10 min): https://dradityaaiims-cloud.github.io/vent-sim/ . Open **Learn > How to use**, run one or two **Scenarios**, and load two items from **Examples** (try reverse triggering and ineffective efforts). Turn on **Show Pmus**.
2. **Check the clinical content** (5 min): the targets and strategies tables in Learn, and the questions and rationales in the cases you tried. Is anything wrong, unsafe or misleading?
3. **Check the realism** (5 min): do the waveforms, numbers and blood gases behave the way you would expect? Where do they not?

## Optional deeper review
- **Manuscript draft** (how it was built; limitations; evaluation plan): `docs/publication/manuscript.docx` in the repository, or the Word file I sent you.
- **Quiz forms and key** (10 matched items each) and the **evaluation protocol**: `docs/publication/`. Are the items clear, correct and at the right level? Is the key right?
- **Model assumptions**: the Model & limits tab, and parameter tags `[SRC] / [CALC] / [ASSUMPTION]` in `js/engine/presets.js`.

## Please tell me
- The single most important error or misleading thing you found.
- Anything you would not want a trainee to learn from it.
- Whether you would use it in teaching, and what would make you more likely to.
- Any citation I should add.

## How to reply
Use the in-app **Feedback / report a bug** link (choose "Content or clinical accuracy" and say which lung type, mode or case), or email me at draditya.aiims@gmail.com. Please do not include patient information.

## Status and credit
Draft for review, not yet a validated or peer-reviewed tool. Please do not cite it as validated, or use it for patient care or assessment. If you give substantive input I will acknowledge you in the manuscript unless you prefer not to be named.

Code (MIT): https://github.com/dradityaaiims-cloud/vent-sim | Archive and DOI: https://doi.org/10.5281/zenodo.23630782 | Content licence: CC BY 4.0
