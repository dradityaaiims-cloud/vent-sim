# Google Form design: "Vent Sim feedback and bug reports"

Create at https://forms.google.com, then **Send > link icon > copy**, and paste the link into `feedbackUrl` in `js/config.js`.

**Settings**
- Responses: do NOT collect email addresses automatically; do not require sign-in.
- Link responses to a Google Sheet (Responses tab > green Sheets icon).
- Confirmation message: "Thank you. I read every response. If you gave an email I may write back."
- Description at top: "Educational simulator only. Please do not enter any patient information."

**Questions**
1. What are you giving? (multiple choice, required): Bug report / Content or clinical accuracy / Feature idea / General feedback
2. Describe it (paragraph, required)
3. Where did it happen? (short answer, optional): e.g. Simulator, case 4, Learn tab
4. Lung type and mode, if relevant (short answer, optional): e.g. COPD, volume control
5. Browser and device (short answer, optional): e.g. Safari on iPad
6. Who are you? (multiple choice, optional): Student / Resident or fellow / Attending or faculty / Respiratory therapist / Nurse / Other
7. How useful was the simulator for learning? (linear scale 1 to 5, optional)
8. Optional email if you would like a reply (short answer, response validation: text > email address)
9. May I quote your comment anonymously? (multiple choice, optional): Yes / No

Section 2 (optional): "Would you use this in teaching? Tell me how." (paragraph)
