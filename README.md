# Dr. Singh's Vent Sim

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.23630783.svg)](https://doi.org/10.5281/zenodo.23630783)

Educational mechanical-ventilator simulator: normal / COPD / ARDS lungs, live monitor, on-demand ABG, loops, and 10 troubleshooting cases with hints and scoring.

**Educational use only. Not for clinical decision-making, assessment or exams. Not affiliated with or endorsed by any ventilator manufacturer.**
Nothing here has been clinically reviewed yet (every preset and case is `reviewed: false`).

## Run locally

No build step. It is plain ES modules, so it must be served over http (not opened as a file).

```bash
npm start        # python3 -m http.server 8080, then open http://localhost:8080
npm test         # 36 physics + scenario tests (Node 18+)
```

Add `?instructor=1` to the URL to show model truth next to what the ventilator reports.

## Put it on GitHub and deploy (GitHub Pages)

1. Create an empty repository on GitHub (for example `vent-sim`).
2. From this folder:
   ```bash
   git init -b main
   git add .
   git commit -m "Dr. Singh's Vent Sim"
   git remote add origin https://github.com/<you>/vent-sim.git
   git push -u origin main
   ```
3. In the repository: **Settings > Pages > Build and deployment > Source: GitHub Actions**.
4. The workflow in `.github/workflows/pages.yml` runs the tests and publishes. The site appears at `https://<you>.github.io/vent-sim/`.

Netlify / Vercel / Cloudflare Pages also work: no build command, publish directory is the repo root (or `_site` contents: `index.html`, `css/`, `js/`).

## Teaching features

- **Examples** (bottom bar): 7 patient-ventilator asynchronies (reverse triggering in PC and VC, ineffective efforts, early and late cycling, breath stacking, auto-triggering), each produced by the engine.
- **Show Pmus** overlays patient effort; triangles mark patient-triggered breaths; **Freeze** plus click gives a crosshair that reads pressure, flow and volume at one instant; **Window** and **Fullscreen** for projection.
- **Share link / learner link** (Tools): the whole setup is encoded in the URL, no server. `?learner=1` hides the patient and examples, `&hidep=1` also hides pressure numbers.
- Measurements include stress index (VC, constant flow) and P0.1.

## Layout

| Path | What |
|---|---|
| `js/engine/engine.js` | Physics (no DOM): extended equation of motion, modes, gas exchange, hemodynamics |
| `js/engine/presets.js` | Patient parameters, each tagged `[SRC]` / `[CALC]` / `[ASSUMPTION]` |
| `js/engine/gas.js` | Alveolar gas, shunt, Severinghaus, Henderson-Hasselbalch |
| `js/scenarios.js` | The 10 cases as data (goals, actions, questions, hints) |
| `js/app.js`, `js/lung.js`, `js/draw.js`, `css/` | UI: ventilator-style screen, animated lungs, loops |
| `js/learn.js` | Learn tab: settings, targets, strategies, pearls, engine-generated waveform gallery |
| `tests/` | Analytic, reference-patient and scenario regression tests |

## Model sources

van Diepen et al., Biomed Signal Process Control 118 (2026) 109770 (CC BY 4.0) for the equation of motion and tube constants; Annals of Intensive Care 2021 (doi 10.1186/s13613-021-00948-9) for the COPD calibration cohort; see `copd-ards-parameter-sheet.md` sources. Verify every citation before public release. Limitations are listed in the app's **Model & limits** tab.

## Not in this version

SIMV/PSIMV, VS, APRV, DuoPAP, NIV/HFOT, ASV-type and closed-loop modes; two-compartment lung and pendelluft; estimator layer; volumetric capnography; esophageal pressure; weaning/stress-strain panels; Web Worker. Live teaching sessions (needs a server), saved scenario accounts, recruited volume / R-I ratio, airway closure, PAV. Licence not chosen yet.
