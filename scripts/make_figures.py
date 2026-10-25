"""Build manuscript figures 1, 3, 4, 5 with matplotlib. Run: python3 scripts/make_figures.py
Inputs: docs/publication/figures/gallery.json, docs/publication/validation/results.json, git log.
Outputs: PNG (300 dpi) and PDF in docs/publication/figures/. Colour-blind-safe palette."""
import json, subprocess, datetime as dt
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

FIG = "docs/publication/figures/"
OR, BL, GR, PK, GY, DK = "#E69F00", "#56B4E9", "#009E73", "#CC79A7", "#8a8a8a", "#222222"
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 9, "axes.spines.top": False, "axes.spines.right": False})


def save(fig, name):
    fig.savefig(FIG + name + ".png", dpi=300, bbox_inches="tight", facecolor="white")
    fig.savefig(FIG + name + ".pdf", bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print("wrote", name)


# ---------------- Figure 1: architecture ----------------
def box(ax, x, y, w, h, text, fc, ec=DK, fs=8.5, bold=False):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.02,rounding_size=0.08", fc=fc, ec=ec, lw=1.2))
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center", fontsize=fs, fontweight="bold" if bold else "normal", color=DK)


def arrow(ax, a, b, text=None, rad=0):
    ax.add_patch(FancyArrowPatch(a, b, arrowstyle="-|>", mutation_scale=12, lw=1.2, color=DK, connectionstyle=f"arc3,rad={rad}"))
    if text:
        ax.text((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.12, text, ha="center", fontsize=7, color="#444")


fig, ax = plt.subplots(figsize=(10, 6.2)); ax.set_xlim(0, 10); ax.set_ylim(0, 6.2); ax.axis("off")
ax.text(0.1, 5.95, "Browser (static files; nothing is sent to a server)", fontsize=9, fontweight="bold")
ax.add_patch(FancyBboxPatch((0.05, 1.55), 9.9, 4.25, boxstyle="round,pad=0.02,rounding_size=0.1", fc="#f6f9fc", ec="#9fb4c9", lw=1))
# engine
ax.text(0.3, 5.45, "Physics engine (js/engine, no DOM)", fontsize=9, fontweight="bold", color=GR)
box(ax, 0.3, 4.35, 2.6, 0.9, "Mechanics: extended equation\nof motion, Rohrer resistance,\nviscoelastic, chest wall", "#dff3ec")
box(ax, 0.3, 3.3, 2.6, 0.85, "Patient: presets (normal, COPD,\nasthma, ARDS), effort, flow\nlimitation, tube", "#dff3ec")
box(ax, 3.1, 4.35, 2.2, 0.9, "Ventilator: modes, triggers,\ncycling, holds, adaptive\ncontrol", "#dff3ec")
box(ax, 3.1, 3.3, 2.2, 0.85, "Gas exchange, acid-base,\nhaemodynamics", "#dff3ec")
box(ax, 0.3, 2.2, 5.0, 0.8, "Parameter file: every constant tagged [SRC] / [CALC] / [ASSUMPTION]", "#fff6dc", ec=OR)
# UI
ax.text(5.7, 5.45, "Interface (js/app.js, lung.js, draw.js)", fontsize=9, fontweight="bold", color="#1b6fa8")
box(ax, 5.7, 4.35, 2.1, 0.9, "Ventilator-style screen:\nwaveforms, loops, dials", "#e1f1fb")
box(ax, 7.9, 4.35, 1.9, 0.9, "Animated lungs,\nmonitor, alarms", "#e1f1fb")
box(ax, 5.7, 3.3, 2.1, 0.85, "Learn tab, About,\nModel and limits", "#e1f1fb")
box(ax, 7.9, 3.3, 1.9, 0.85, "Share / learner links\n(setup in the URL)", "#e1f1fb")
box(ax, 5.7, 2.2, 4.1, 0.8, "Scenarios and asynchrony examples as DATA\n(goals, actions, questions, hints)", "#fff6dc", ec=OR)
arrow(ax, (2.9, 4.8), (3.1, 4.8)); arrow(ax, (5.3, 4.8), (5.7, 4.8))
ax.text(5.5, 5.02, "samples", ha="center", fontsize=7, color="#444"); arrow(ax, (4.2, 3.3), (4.2, 3.0))
# outside
box(ax, 0.3, 0.2, 2.5, 0.85, "Automated tests (43)\nanalytic, reference patient,\nscenarios", "#fde5e5", ec="#c0392b")
box(ax, 3.1, 0.2, 2.3, 0.85, "GitHub: source, CI,\nPages hosting", "#eeeeee")
box(ax, 5.7, 0.2, 2.0, 0.85, "Zenodo: DOI\nfor each release", "#eeeeee")
box(ax, 7.9, 0.2, 1.9, 0.85, "Cloudflare analytics,\nGoogle Form feedback", "#eeeeee")
arrow(ax, (1.55, 1.05), (1.55, 3.3)); arrow(ax, (2.8, 0.62), (3.1, 0.62))
ax.text(2.95, 0.33, "gate", ha="center", fontsize=7, color="#444"); arrow(ax, (5.4, 0.62), (5.7, 0.62)); arrow(ax, (7.7, 0.62), (7.9, 0.62))
ax.text(5.0, 1.3, "Build, verify, publish", fontsize=9, fontweight="bold")
save(fig, "fig1-architecture")

# ---------------- Figure 3: waveform gallery ----------------
G = json.load(open(FIG + "gallery.json"))
fig = plt.figure(figsize=(12, 10)); outer = fig.add_gridspec(3, 3, hspace=0.5, wspace=0.22, bottom=0.1)
for i, c in enumerate(G):
    inner = outer[i // 3, i % 3].subgridspec(2, 1, hspace=0.08)
    a1 = fig.add_subplot(inner[0]); a2 = fig.add_subplot(inner[1], sharex=a1)
    a1.plot(c["t"], c["paw"], color=OR, lw=1.3)
    if max(c["pmus"]) > 0.05:
        a1.plot(c["t"], [c["peep"] - p for p in c["pmus"]], color=PK, lw=1, ls="--")
    for tt in c["trig"]:
        a1.plot([tt], [-3.2], marker="^", color=PK, ms=6, clip_on=False)
    a2.plot(c["t"], c["flow"], color=BL, lw=1.3); a2.axhline(0, color=GY, lw=0.5)
    a1.set_title(c["title"], fontsize=8.5, loc="left"); a1.set_ylabel("Paw\ncmH2O", fontsize=7); a2.set_ylabel("Flow\nL/min", fontsize=7)
    a1.tick_params(labelbottom=False, labelsize=7); a2.tick_params(labelsize=7); a2.set_xlabel("seconds", fontsize=7)
    a1.set_ylim(-5, max(30, max(c["paw"]) + 3))
fig.text(0.5, 0.02, "Orange: airway pressure. Blue: flow (above zero = inspiration). Dashed pink: patient muscle pressure (shown relative to PEEP). Triangles: patient-triggered breaths.",
         ha="center", fontsize=8)
save(fig, "fig3-waveform-gallery")

# ---------------- Figure 4: validation ----------------
R = json.load(open("docs/publication/validation/results.json"))
fig, axs = plt.subplots(2, 3, figsize=(12, 7)); axs = axs.ravel()
L = R["linearLimit"]
axs[0].plot(L["t"], L["model"], color=GY, lw=4, alpha=0.5, label="exp(-t/RC)"); axs[0].plot(L["t"], L["v"], color=BL, lw=1.5, label="engine")
axs[0].set_title(f"A  Linear limit: tau = RC = {L['tau']:.2f} s", loc="left", fontsize=9); axs[0].set_xlabel("s"); axs[0].set_ylabel("volume above relaxed, mL"); axs[0].legend(frameon=False, fontsize=7)
rows = R["cohort"]["rows"]; pub = R["cohort"]["published"]
for key, col, lab in [("pip", OR, "peak"), ("pplat", GR, "plateau"), ("peepi", PK, "auto-PEEP")]:
    axs[1].plot([r["qmax"] for r in rows], [r[key] for r in rows], "-o", color=col, ms=3, label=lab)
    axs[1].axhline(pub[key], color=col, ls=":", lw=1)
axs[1].axvline(0.10, color=GY, lw=0.8); axs[1].set_title("B  COPD cohort (dotted = published means)", loc="left", fontsize=9)
axs[1].set_xlabel("flow-limit parameter qmax, L/s"); axs[1].set_ylabel("cmH2O"); axs[1].legend(frameon=False, fontsize=7)
W = R["waterfall"]
axs[2].plot([w["peep"] for w in W], [w["peepTot"] for w in W], "-o", color=BL, ms=3, label="total PEEP"); axs[2].plot([w["peep"] for w in W], [w["peep"] for w in W], color=GY, ls=":", label="set PEEP (line of identity)")
axs[2].set_title("C  Flow-limited lung: waterfall effect", loc="left", fontsize=9); axs[2].set_xlabel("set PEEP, cmH2O"); axs[2].set_ylabel("total PEEP, cmH2O"); axs[2].legend(frameon=False, fontsize=7)
A = R["apv"]
axs[3].plot(range(1, len(A["vte"]) + 1), A["vte"], "-o", color=GR, ms=3); axs[3].axhline(A["target"], color=GY, ls=":")
axs[3].set_title("D  Adaptive mode after compliance halved", loc="left", fontsize=9); axs[3].set_xlabel("breaths after step"); axs[3].set_ylabel("exhaled VT, mL"); axs[3].set_ylim(250, 520)
P = R["paco2"]
axs[4].plot(P["t"], P["paco2"], color=OR, lw=1.8); axs[4].axvline(P["timeTo63pct_min"], color=GY, ls=":")
axs[4].set_title(f"E  PaCO2 after rate halved (63% at {P['timeTo63pct_min']} min)", loc="left", fontsize=9); axs[4].set_xlabel("minutes"); axs[4].set_ylabel("PaCO2, mmHg")
H = R["holdDecay"]["rows"]
axs[5].plot([h["hold_s"] for h in H], [h["pplat"] for h in H], "-o", color=PK, ms=3); axs[5].set_xscale("log")
axs[5].set_xticks([0.25, 0.5, 1, 2, 5]); axs[5].set_xticklabels(["0.25", "0.5", "1", "2", "5"]); axs[5].minorticks_off()
axs[5].set_title("F  Plateau depends on hold duration", loc="left", fontsize=9); axs[5].set_xlabel("hold duration, s"); axs[5].set_ylabel("plateau, cmH2O")
fig.tight_layout()
save(fig, "fig4-validation")

# ---------------- Figure 5: timeline ----------------
commits = []
for line in open(FIG + "commits.txt"):
    t, msg = line.strip().split("|", 1)
    h, m = map(int, t.split(":")); commits.append((h * 60 + m, msg))
commits.sort()
start = 19 * 60 + 49
phases = [
    (start, 20 * 60 + 10, "Plan in hand;\nengine, tests,\n10 cases", "D1-D6, D9\nC1-C7"),
    (20 * 60 + 10, 20 * 60 + 49, "Interface, lungs,\nloops, Learn,\nasynchrony", "D7, D8\nC8-C10"),
    (20 * 60 + 49, 21 * 60 + 10, "About, citation,\nfeedback", "D10, D11"),
    (21 * 60 + 10, 22 * 60 + 16, "Deploy, DOI, analytics,\nlicences, release,\nmanuscript", "D12\nC11-C15"),
    (22 * 60 + 16, 23 * 60 + 8, "Figures; peer-feedback\niteration: setup, patient\nbar, Learn first, tour", "D13-D16\nC16-C17"),
]
fig, ax = plt.subplots(figsize=(12, 3.8)); ax.set_xlim(start - 8, 23 * 60 + 14); ax.set_ylim(-1.6, 1.8)
ax.axhline(0, color=DK, lw=2)
cols = [GR, BL, OR, PK, '#8c6bb1']
for (a, b, txt, dec), c in zip(phases, cols):
    ax.add_patch(plt.Rectangle((a, -0.14), b - a, 0.28, color=c, alpha=0.75))
    ax.text((a + b) / 2, 0.55, txt, ha="center", va="bottom", fontsize=8)
    ax.text((a + b) / 2, -0.45, dec, ha="center", va="top", fontsize=7.5, color="#444")
for t, msg in commits:
    ax.plot([t, t], [-0.22, 0.22], color=DK, lw=1.2)
ax.plot([start], [0], marker="o", color=DK); ax.text(start, 0.35, "19:49\nfolder", ha="center", va="bottom", fontsize=7.5)
ax.set_yticks([]); ax.spines[["left", "right", "top"]].set_visible(False)
ticks = list(range(20 * 60, 23 * 60 + 1, 30)); ax.set_xticks(ticks); ax.set_xticklabels([f"{t // 60}:{t % 60:02d}" for t in ticks])
ax.set_xlabel("Clock time, 24 October 2026 (US Eastern). Black ticks = commits (n = %d).\nD = decision, C = challenge (Sections 6.1 and 6.2); grouped by build phase, not exact times." % len(commits), fontsize=8)
save(fig, "fig5-timeline")
