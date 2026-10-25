# Manuscript outline (draft for preprint)

Licence of this document: CC BY 4.0. Every reference below must be checked against the original before submission (I could not verify all citation details).

## Working titles
1. *Dr. Singh's Vent Sim: design, validation and deployment of a free, open-source, browser-based mechanical ventilator simulator for medical education*
2. *A physics-based, serverless ventilator simulator for trainees: technical description and educational evaluation*

## Article type and where it fits
- Preprint first: EdArXiv or OSF Preprints (no fee), or medRxiv (Medical Education category; check its current scope and ORCID requirements).
- Journal targets later: MedEdPORTAL (needs evidence of effectiveness), JOSS (needs time and scholarly depth), Medical Teacher / Advances in Physiology Education / Respiratory Care (confirm fee policy).
- Reporting guidance to follow: SQUIRE-EDU (educational improvement) and the simulation-research extensions of CONSORT/STROBE (Cheng et al., Simul Healthc 2016: verify citation). A short technical-report format is acceptable for a first preprint.

## Structured abstract (250 words)
- **Background:** ventilator management is taught with expensive manikins or proprietary simulators that are hard to share and adapt; trainees need to link settings, waveforms and physiology.
- **Objective:** describe and evaluate a free, open-source, browser-based simulator.
- **Methods:** physics engine (extended equation of motion, two-parameter viscoelasticity, flow-dependent resistance, expiratory flow limitation, gas exchange), validation against analytic results and published cohort values, 10 cases, 7 asynchrony examples, deployment as a static site; educational evaluation with [N] learners using pre/post quiz and survey.
- **Results:** [fill: tests passed, cohort agreement, score change with CI, effect size, usability].
- **Conclusions:** [fill, limited to what the data support].
- **Keywords:** mechanical ventilation; simulation; medical education; open source; patient-ventilator asynchrony.

## 1. Introduction (400-600 words)
1. Why ventilator education matters: errors, variable training, high stakes (cite).
2. Existing tools and their gaps: high-fidelity manikins (cost, access), vendor simulators (proprietary), free browser simulators (describe neutrally, for example the RT Maven simulator; Hardman et al., Br J Anaesth 1998; Serna et al., IEEE EMBC 2010; open engines such as Pulse and BioGears). State what is missing: a free, open, auditable model with parameter provenance, scenarios, and teaching content together.
3. Aim and contribution (bullet list).

## 2. Methods
### 2.1 Design principles
Physics separated from interface; every constant tagged as sourced, calculated or assumed; static deployment (no server, no accounts, no patient data); open licence.
### 2.2 Model
- Mechanics: extended equation of motion (van Diepen et al. 2026), Rohrer resistance for airway and tube (Table 3 constants), viscoelastic element, chest wall in series, Venegas sigmoid for ARDS (Venegas 1998).
- Deviation from the source: PEEP enters through airway pressure (state and justify).
- COPD and asthma: smooth expiratory flow limitation with collapse pressure and volume-dependent maximum flow, calibrated to one cohort (Annals of Intensive Care 2021). State as unvalidated extension.
- Patient effort: half-sine or shaped (rise, hold, decay); reverse-triggering and cardiac-oscillation models.
- Ventilator modes: VC, PC, adaptive pressure control, pressure support/CPAP; triggers and cycling; holds. Mode taxonomy reference: Chatburn et al., Respir Care 2014 (verify).
- Gas exchange: alveolar ventilation, CO2 store (time constant), alveolar gas equation, shunt equation, Severinghaus curve, Henderson-Hasselbalch with chronic bicarbonate, hemodynamic venous-return penalty.
- Table 1: parameters, source, and tag ([SRC], [CALC], [ASSUMPTION]) for each preset.
### 2.3 Software and deployment
Plain JavaScript modules, no build step; automated tests (count); GitHub Pages deployment with continuous integration; Zenodo DOI; MIT and CC BY 4.0 licences; privacy-friendly analytics only. Figure 1: architecture diagram.
### 2.4 Educational design
Ventilator-style screen, animated lungs, always-visible loops, Learn tab (settings, targets, strategies, formulas, pearls), 10 scenarios with goals, hints and scoring, 7 asynchrony examples, share/learner links, freeze and crosshair. Table 2: learning objectives mapped to features.
### 2.5 Technical validation
1. Analytic tests (exponential emptying with tau = RC; closed-form flow equals root finder; Henderson-Hasselbalch round trip; alveolar gas and shunt equations; tube drop).
2. Reference patient: ABG on reasonable settings (pH, PaCO2, PaO2).
3. Cohort agreement: COPD preset versus published cohort means (PIP, plateau, auto-PEEP). Report with a plot.
4. Scenario tests: start state fails goals, correct fix passes, wrong fix fails.
5. Comparison with an external engine or published simulations (Pulse or BioGears, Hardman 1998): choose 3-5 outputs; report differences.
6. Expert face validity: [clinician review process, number of reviewers, structured form]. Leave empty until done; do not claim review before it happens.
### 2.6 Educational evaluation (see `evaluation-protocol.md`)
Design, participants, intervention, outcomes (10-item quiz in two matched forms, confidence ratings, usability and satisfaction survey), ethics approval or exemption, analysis plan (paired test, effect size, form-effect check).

## 3. Results (placeholders)
- Table 3: technical validation (tests passed, cohort agreement numbers, external comparison).
- Figure 2: screenshot of the simulator. Figure 3: waveform gallery produced by the engine. Figure 4: validation plot (COPD cohort and one comparison).
- Table 4: participant characteristics.
- Figure 5: pre/post scores (paired lines). Table 5: item-level change. Table 6: survey results. Free-text themes.

## 4. Discussion
- Principal findings (only what the data show).
- Comparison with existing tools (neutral, factual).
- Why open and auditable helps: reuse, modification, scrutiny.
- **Limitations (state plainly):** single-compartment lung (no pendelluft); expiration, auto-PEEP and flow limitation are unvalidated extensions; COPD, asthma and ARDS parameters are partly assumptions; hemodynamics simplified; flow trigger only; no PAV, APRV, NIV or closed-loop modes; evaluation size, single institution, no control group, short-term outcomes, self-selected volunteers; not for clinical use or assessment.
- Future work: clinical review panel, two-compartment lung, estimator layer, more modes, multi-site randomized comparison, retention testing, accessibility testing.

## 5. Conclusion (2-3 sentences, tied to evidence)

## Declarations
- Ethics: [approval/exemption number or statement].
- Consent: [participants gave consent; no patient data used].
- Funding: none declared (confirm).
- Competing interests: none declared (confirm).
- **AI assistance:** the software and drafts of educational materials were developed with AI coding assistance (Claude, Anthropic), directed and checked by the author. AI is not an author.
- Data and code availability: code https://github.com/dradityaaiims-cloud/vent-sim; archived DOI 10.5281/zenodo.23630783; de-identified evaluation data [repository].
- Acknowledgements: [people who reviewed or tested].
- Author contributions (CRediT).

## Reference starter list (verify every entry)
1. van Diepen et al. Biomed Signal Process Control 118 (2026) 109770.
2. Chatburn RL, et al. Taxonomy for mechanical ventilation. Respir Care 2014.
3. Hardman JG, et al. A physiology simulator: validation of its respiratory components. Br J Anaesth 1998.
4. Serna LY, Hernandez AM, Mananas MA. Computational tool for modeling and simulation of mechanically ventilated patients. IEEE EMBC 2010.
5. Venegas JG, Harris RS, Simon BA. A comprehensive equation for the pulmonary pressure-volume curve. J Appl Physiol 1998.
6. ARDS Network. Ventilation with lower tidal volumes. N Engl J Med 2000;342:1301.
7. Amato MBP, et al. Driving pressure and survival in ARDS. N Engl J Med 2015.
8. Guerin C, et al. Prone positioning in severe ARDS (PROSEVA). N Engl J Med 2013;368:2159.
9. Yang KL, Tobin MJ. RSBI. N Engl J Med 1991;324:1445.
10. Annals of Intensive Care 2021 COPD cohort, doi 10.1186/s13613-021-00948-9.
11. Giri J, et al. Design and simulation of AI-based low-cost mechanical ventilator. Mater Today Proc 2021;47:5886 (related work only).
12. Pulse Physiology Engine and BioGears (open-source physiology engines).
13. Cheng A, et al. Reporting guidelines for health care simulation research. Simul Healthc 2016.

## Claims discipline (read before writing)
- You may say: the model reproduces listed analytic results and the stated cohort means; learners improved by X (CI) on a matched quiz; survey ratings were Y.
- You may not say: clinically validated, replaces simulation centres, improves patient outcomes, or that content is clinically reviewed, until those are true.
