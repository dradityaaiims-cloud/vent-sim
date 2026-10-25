// Static "Model & limits" page.
export const MODEL_HTML = `
<div class="prose">
<h2>How the model works</h2>
<p>The physics engine (<code>js/engine/</code>) is a pure JavaScript library stepped at 2 ms. The UI only draws its output. Everything on the waveforms emerges from the equations below; nothing is drawn by hand.</p>
<h3>Core mechanics: extended equation of motion</h3>
<p><code>Pao = Pel(V) + K1&middot;V&#775; + K2&middot;V&#775;|V&#775;| + Pvisco &minus; Pmus</code>, with <code>dPvisco/dt = V&#775;/Cd &minus; Pvisco/(Rd&middot;Cd)</code>.
Rohrer (flow-dependent) resistance for airway and endotracheal tube, a viscoelastic element, a Venegas sigmoid lung in series with a chest wall (ARDS), patient effort Pmus, and a tracked lung volume so auto-PEEP emerges from the physics.
Source: van Diepen et al., Biomed Signal Process Control 118 (2026) 109770 (CC BY 4.0). Tube constants are that paper's Table 3.</p>
<p><b>Deviation:</b> the paper adds a separate PEEP term. Here Pel(V) is recoil above the relaxed volume, so PEEP acts through Pao itself. Adding it twice would leave the lung at its relaxed volume and PEEP would do nothing.</p>
<h3>Ventilator</h3>
<table><tr><th>Mode in this app</th><th>Common abbreviation</th><th>What it does</th></tr>
<tr><td>Volume control</td><td>(S)CMV, VC-CMV</td><td>Set tidal volume and flow pattern, time-cycled; triggered or timed breaths.</td></tr>
<tr><td>Pressure control</td><td>PCV+, PC-CMV</td><td>Set pressure above PEEP, time-cycled. Flow and volume follow the lung.</td></tr>
<tr><td>Adaptive pressure control</td><td>APVcmv, (S)CMV+</td><td>Pressure control whose level is adjusted breath to breath (max 3 cmH2O per breath, bounded by the pressure limit minus 10) to hit the target volume. Generic implementation, not a replica of any manufacturer's algorithm.</td></tr>
<tr><td>Spontaneous</td><td>PSV, CPAP</td><td>Patient-triggered pressure support, flow-cycled; apnea backup after 20 s.</td></tr></table>
<h3>Gas exchange</h3>
<p>Alveolar ventilation comes from the delivered breaths and dead space. PaCO2 follows a large CO2 store (time constant about 12 minutes at normal ventilation; use the time-speed control). Oxygenation uses the alveolar gas equation, a shunt fraction (PEEP-recruitable in ARDS) and a closed-form shunt equation; saturation uses the Severinghaus curve with a Bohr shift. Acid-base is Henderson-Hasselbalch with a chronic bicarbonate baseline per patient (COPD is not normal at a normal PaCO2).</p>

<h2>Limitations (read these)</h2>
<ul>
<li><b>Not validated for clinical use.</b> Every parameter is tagged in <code>js/engine/presets.js</code> as cited, calculated or an assumption. <b>Nothing has been clinically reviewed yet</b> (every preset and case carries <code>reviewed: false</code>).</li>
<li>The paper models inspiration only. <b>Expiration, auto-PEEP and expiratory flow limitation are unvalidated extensions.</b> COPD flow limitation uses a smooth saturating law with an airway-collapse (waterfall) pressure and volume-dependent maximum flow. These forms and the numbers are assumptions calibrated to one cohort (Annals of Intensive Care 2021, n = 16). The paper contains no COPD-specific values.</li>
<li>COPD and ARDS auto-PEEP is very sensitive to expiratory time. A small change can tip a patient into runaway stacking. That is intentional teaching, and a pressure-limit cut-off stops the extreme case.</li>
<li>ARDS Venegas parameters are chosen to hit target compliance and shunt; no published typical a/b/c/d exist. Recruitment is modeled as a PEEP-dependent shunt reduction, overdistension as extra dead space above a plateau of 30. Both are assumptions. Shunt, compliance and chest wall values lean partly on COVID-ARDS series.</li>
<li><b>Single lung compartment.</b> Pendelluft, regional overdistension, sequential-emptying capnography, esophageal pressure, leak/NIV, APRV, SIMV, ASV-type and closed-loop modes are not in this version.</li>
<li>Hemodynamics are a simple venous-return penalty from mean airway pressure and auto-PEEP. The ventilator-reported compliance and resistance use only a plateau hold, not the full estimator layer.</li>
<li>Patient effort is either a half-sine or a shaped waveform (smoothstep rise, hold and decay) of fixed amplitude on its own clock. It does not yet respond to the level of ventilator support. Triggering is flow-based only (no pressure trigger).</li>
<li>Reverse triggering is modeled as an effort that starts a fixed delay after a machine breath. Cardiac oscillation is a sinusoid added to the flow signal used for trigger detection. Both are teaching approximations, not fitted to patient data.</li>
<li>Not modeled: recruited volume and the recruitment-to-inflation ratio, airway closure and opening pressure, proportional assist ventilation, upper-inflection-point overdistension for linear lungs, natural breath-to-breath variability. The stress index is computed from the simulated pressure curve and is only meaningful for passive volume control with constant flow.</li>
<li>The asthma lung type (compliance 40 mL/cmH2O, resistance about 30, severe flow limitation) is an assumption chosen to look like a severe exacerbation.</li>
<li>Educational tool, not for assessment or exams. No data leaves your browser. Progress is stored in <code>localStorage</code> only.</li>
</ul>
<h2>Related work</h2>
<p>Other browser ventilator simulators exist (for example the RT Maven simulator by T. Piraino, which has a strong asynchrony and teaching-session focus). This app was designed independently; its content and code are original, and feature ideas such as asynchrony examples, share links and learner mode follow common teaching practice. Please cite the sources listed in the README for the physiology.</p>
</div>`;
