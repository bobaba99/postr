# UI Audit High/Medium Fixes — Design

**Date:** 2026-07-29  
**Source:** `docs/ux-audit/2026-07-29-uimax-initial/REPORT.md`  
**Status:** Approved

## Goal

Resolve every High and Medium finding from the initial UIMax audit without changing pricing, checkout, consent, or authentication behavior.

## Design principles

1. Lead with the user's task and the core message.
2. Keep essential commercial and consent facts visible or plainly discoverable.
3. Use only three or four supporting messages for each plan.
4. Limit every supporting description to 15 words.
5. Use progressive disclosure for secondary mobile detail.
6. Preserve the existing dark, restrained Postr visual language.

## Route navigation

Add one route-level scroll policy inside `BrowserRouter`:

- `PUSH` and `REPLACE` navigation start at the top.
- `POP` navigation preserves native browser history restoration.
- Hash navigation is not overridden.

This fixes pricing-to-signup carry-over without breaking Back restoration.

## Pricing hierarchy

### Page

- Core message: free creation and PDF; payment is for editable exports.
- One description of at most 15 words.
- Remove the repeated “Which should I pick?” paragraph.
- Keep the paper-to-talk waitlist as a compact tertiary callout.

### Plans

Every card keeps:

1. Name, price, and cadence.
2. One use-case message.
3. One essential commercial condition, always visible.
4. Two core feature messages.
5. One CTA.

Each use case, condition, and feature message must contain at most 15 words.

On mobile, the two feature messages live under **What’s included**. From the small breakpoint upward, they remain visible without interaction.

Planned messages:

| Plan | Use case | Features | Condition |
| --- | --- | --- | --- |
| Free | For one poster you can print or present. | Unlimited editing and every design tool. / Print-ready PDF export. | Includes a small Postr mark. |
| Term | For repeated posters and editable exports all term. | PowerPoint and LaTeX exports with no watermark. / Keep editing your posters anywhere. | Renews every four months. Cancel anytime. |
| Export pack | For a few editable exports without a subscription. | Three PowerPoint or LaTeX exports. / Purchased exports have no watermark. | One-time purchase. Credits never expire. |

### Responsive layout

- One card column on phones.
- Two card columns from 768px.
- Three card columns from 1024px.
- Price and cadence may wrap as a unit without overflowing.
- The featured card offset begins only with the three-column layout.

## Signup hierarchy

Paid signup keeps this order:

1. Selected plan and price.
2. **Create your account** as the page `h1`.
3. **Change plan** recovery link.
4. Google or email account creation.
5. Optional email preferences.
6. Compact legal footer.

The optional research and marketing choices move into a closed **Email preferences (optional)** disclosure. Both choices remain unchecked and use descriptions of at most 15 words.

The full marketing sitemap footer is removed from auth because it distracts from account creation. A compact legal footer retains Privacy, Terms, and Cookies.

## Public navigation

The flat desktop navigation remains visible only from 1280px, where all labels fit on one line. The existing accessible overflow menu covers smaller widths.

The pricing grid remains independent: it may use three columns from 1024px even while the header still uses its compact menu.

## Color contrast

Use the existing darker violet `#5641b8` behind white text. Use `#8b8f99` or lighter for supporting text on near-black surfaces.

Correct the shared header/footer tokens and every audited route-specific occurrence that produced an axe contrast failure. Do not globally recolor unrelated editor surfaces without evidence.

## Heading structure

- Auth's primary task becomes an `h1`.
- Public footer column headings become `h2`.
- About's timeline receives an `h2` before milestone `h3` elements.

These changes preserve visual styling while producing a valid document outline.

## Verification

- Unit regressions cover route scroll behavior, headings, plan recovery, breakpoints, message counts, and 15-word limits.
- Existing component and route tests remain green.
- A production build must succeed.
- Browser checks reproduce the original pricing-to-auth path at 375px.
- Responsive checks cover 375px, 768px, 1024px, and 1440px.
- UIMax/axe is rerun on the audited routes; no High or Medium finding is closed without fresh evidence.

