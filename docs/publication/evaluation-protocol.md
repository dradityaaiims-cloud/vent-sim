# Educational evaluation protocol and survey (draft)

(CC BY 4.0.) Draft for your ethics board. Edit the bracketed items. Nothing here has been approved or piloted.

## 1. Ethics and consent first
- Submit to your institution's IRB or ethics board *before* collecting data. A voluntary, anonymous education study with no identifiable data often qualifies for exemption, but only the board can decide. Ask what they need for a resident or student survey and quiz.
- Do not collect names, emails or any patient information. Use a self-chosen participant code (for example, first two letters of the street you grew up on + birth month number).
- Voluntary: participation, declining, or poor scores have no effect on grades or evaluations. Say so in writing. Do not run it as part of an assessed activity. Avoid your own direct supervisees if possible, or have someone else administer it.
- Consent text (edit): "This is a voluntary, anonymous study of a free ventilator teaching simulator. You will complete a short quiz, use the simulator for about 45 minutes, then complete a second quiz and a short survey. We record answers only under a code you choose. You may stop at any time. Results may be published in aggregate. Contact [name, email]. [IRB statement]."

## 2. Design
Single-group pre-post study, with the two matched quiz forms counterbalanced (half take A then B, half take B then A) so a form effect can be checked. Optional retention test (Form A or B again) at 4 weeks.

## 3. Participants and size
- Residents and/or medical students who have not already completed a dedicated ventilator course. Record training level and prior ventilator exposure.
- Rough size: to detect a paired effect of about 0.6 standard deviations with 80% power at alpha 0.05, about 24 participants. Larger is better. State that this is a convenience sample.

## 4. Intervention (about 60 minutes)
1. 5 min: consent, participant code, pre-quiz (Form A or B), confidence items. About 10 minutes in total including the quiz.
2. 10 min: orientation: the built-in guided tour (about 1 minute; learners may replay it) and the Learn tab quick start, "How to use" and "Reading the screen". Note whether each learner finds the Patient bar, Controls and Insp hold unaided in the first five minutes (observer checklist).
3. 30 min: guided practice on the cases, in this order: case 1 (high peak pressure), case 2 (pneumothorax), case 3 (auto-PEEP), case 5 (tidal volume by weight), case 10 (SBT), plus two asynchrony examples (ineffective efforts, double triggering). Use hints as needed.
4. 10 min: facilitator debrief (what changed in the waveforms? what is the fix?).
5. Post-quiz (the other form) and the survey in section 6. Learners work alone or in pairs: record which.
Optional comparison arm: the same material as a slide lecture, with participants randomized. Do this only with enough participants and ethics approval.

## 5. Outcomes and analysis
- **Primary:** change in quiz score (0 to 10), post minus pre.
- **Secondary:** change in confidence items a to f; survey ratings; item-level change; completion rate.
- **Analysis plan:** paired t test, or Wilcoxon signed-rank test if differences are not roughly normal; report mean difference with 95% CI and Cohen's dz. Check form effect (does Form A vs B order change post minus pre?). Item difficulty and discrimination from the pre-test. Report missing data. For the optional retention test, repeated-measures comparison of pre, post and 4 weeks.
- **Honest limits to state:** no control group, learning effects from repeating similar questions, quiz forms not yet shown to be equally difficult, volunteers only, self-reported confidence.
- Pilot the quiz with 5 to 10 people (including a pulmonary/critical care faculty member) before the study: fix unclear items and confirm the key.

## 6. Short evaluation survey (post-session, anonymous, about 5 minutes)

Rate each statement from 1 (strongly disagree) to 5 (strongly agree).

**Usability**
1. I could use the simulator without help after the orientation.
2. The screen and controls were easy to understand.
3. The Learn tab explained what I needed.
3a. The guided tour helped me understand the screen.
3b. I knew where to start when I first opened the simulator.
3c. The first-run patient setup was easy to use.

**Realism and learning**
4. The waveforms and numbers looked like what I see on a real ventilator.
5. The simulator showed me why a setting change has its effect.
6. The cases were at a useful level of difficulty.
7. The asynchrony examples helped me recognise problems on waveforms.
8. The hints helped me without giving away the answer.

**Impact**
9. I feel more confident managing a ventilated patient than before.
10. I would use this simulator again to practise.
11. I would recommend it to a colleague.

**Mental effort (one item):** "How much mental effort did the session need?" 1 (very, very low) to 9 (very, very high).

**Context (tick):** device (laptop, tablet, phone); browser; worked alone or in pairs; time spent.

**Open questions**
12. What was most useful?
13. What was confusing or wrong? (Please name the lung type, mode or case.)
14. What would you add?
15. Anything in the clinical content you think is incorrect?

Optional validated alternative: the System Usability Scale (Brooke 1996) can replace items 1 to 3 if you want a standard score; check its terms of use and cite it.

## 7. Building it in Google Forms
- One form per participant path (A then B, B then A), or one form with a "Which form?" question; use sections: consent, code, quiz, confidence, [break for the simulator session], second quiz, survey.
- Turn off "collect email addresses". Do not require sign-in. Turn on "Limit to 1 response" only if sign-in is off-limits (it needs sign-in), so rely on codes instead.
- Mark quiz questions as required; use "Quiz" mode only for the correct answers if you want automatic scoring, but do not show the key until the study ends.
- Export responses to a spreadsheet, remove timestamps if they could identify people, and keep the raw file private.

## 8. After the study
Share de-identified data (a CSV with code, form order, pre, post, confidence, survey) in an open repository (for example OSF or Zenodo), with the quiz and key, under CC BY 4.0. Report all results, including null or negative ones.
