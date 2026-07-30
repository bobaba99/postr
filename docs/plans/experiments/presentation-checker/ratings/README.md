# Ground-truth rating (spec §7.3)

Rate all 20 posters BEFORE looking at any checker output. One `<id>.json`
per poster in `gavin/`. Rate as if seeing each poster for the first time —
even the ones you seeded yourself.

For each poster fill:

- **dimensionScores** — narrative / design / content, integers 1–5.
  Anchors (rubric v1):
  - **Narrative** — 1: no recoverable storyline; key result unreachable from the scan path. 3: story recoverable with effort; result present but not landing early. 5: eye lands on the key result early; hook → takeaway recoverable; every figure connects to its text.
  - **Design** — 1: over-emphasis competition or wall of text; unreadable at distance. 3: hierarchy present but contested; some legibility issues. 5: one clear entry point onto the core result; emphasis well dosed; legible at distance.
  - **Content** — 1: jargon walls or unsupported central claim. 3: mostly audience-appropriate; some under-evidenced claims. 5: right register; every claim tied to evidence shown; balanced.
- **checklist** — flip to `true` every issue actually present. Judge the
  poster, not your memory of seeding it.
- **comments** — first-class (§7.3): write what you'd tell the author.
  These get reconciled qualitatively against the checker's findings.
