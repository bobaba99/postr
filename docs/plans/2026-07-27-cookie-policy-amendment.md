# Cookie Policy Amendment — staged, ships WITH the analytics code

**Status:** Drafted and reviewed, deliberately **not applied**. Applying it before cookieless
analytics actually ships would put a false statement in a legal document.

---

## Why this is not a live edit tonight

`apps/web/src/pages/Cookies.tsx` is accurate right now. Postr genuinely runs no analytics —
grep confirms zero analytics code in the app — so every claim in Section 4 is true as written.
Rewriting it today to describe cookieless analytics would publish a claim about software that
does not exist, in the one document users are most entitled to trust. That is the same
credibility failure the project's marketing rule guards against (verify every claim against the
code first), with legal exposure attached rather than just reputational.

So: this amendment lands in the **same commit** as the analytics implementation. Not before.

**One thing that must not happen in between:** quietly deleting the named-tools bullet now, so
that adding analytics later looks consistent. Weakening a promise in advance of breaking it is
worse than changing it openly at the moment it stops being true. Leave Section 4 alone until
the code lands, then change it in the open with a bumped `LAST_UPDATED`.

## The obligation being discharged

Section 4 currently carries a forward commitment that is **broader than the law requires**:

> If we ever add optional analytics or any other non-essential technology, we will update this
> policy, display a consent banner with equally-visible "Accept" and "Reject" choices, and
> refrain from setting any non-essential storage until you click "Accept".

ePrivacy Art. 5(3) attaches the consent requirement to *storage of, or access to, information on
the user's device*. A genuinely storage-free analytics implementation — no cookie, no
localStorage, no sessionStorage, no fingerprint-derived identifier — does not trigger it, and
neither Quebec Law 25 nor PIPEDA independently requires a banner for it.

But Postr promised a banner for "any other non-essential technology," full stop, with no storage
carve-out. Two honest ways to discharge that, and the choice is the owner's:

| Option | What it means |
|---|---|
| **A. Honour the promise as written** | Ship the consent banner anyway, even though the law does not require it for storage-free measurement. Costs consent-gated undercounting, which is the exact data-quality problem the cookieless choice was meant to avoid. |
| **B. Narrow the promise, and say so** | Rewrite the commitment to attach to *device storage* rather than to "non-essential technology," and state plainly in Section 8 that the commitment was narrowed and when. Legally sound and factually honest, but it is a promise being narrowed, so it must be visible rather than silent. |

**Recommendation: B, executed loudly.** The substance users care about — nothing stored on your
device, no cross-site tracking, no profile — is preserved and strengthened. What changes is the
trigger for a banner nobody benefits from. The condition is that the narrowing is disclosed in
the changelog section rather than slipped in.

## Hard constraints on the implementation, or this amendment is void

The wording below is only true if the analytics implementation actually satisfies all of these.
Verify against the code before publishing, not after:

- No cookie, `localStorage`, `sessionStorage`, IndexedDB, or cache-based identifier.
- No fingerprinting: no canvas, font enumeration, or hash of user-agent + IP standing in for an ID.
- Any visitor-session notion is derived server-side and non-reversible, retained ≤ 13 months.
- No third-party JS on the page; first-party endpoint only.
- IP is used for coarse geo/bot-filtering at most, never stored raw alongside behavioural data.

If any of these fails, the storage-free framing collapses, Option B is off the table, and the
consent banner becomes mandatory.

---

## The exact edits

### 1. `LAST_UPDATED`

```diff
-const LAST_UPDATED = 'April 10, 2026';
+const LAST_UPDATED = '<date the analytics code ships>';
```

### 2. Section 3 table — add a row

Insert into the "What Postr uses today" table, matching the existing 4-column shape
(name, type, purpose, retention):

```
[
  'Aggregate usage measurement',
  'no device storage',
  'Counts page views and which features are used, so we can tell what to improve. Measured on our own servers with no identifier written to your device, and never linked to your account or to activity on other sites.',
  'Aggregated on collection; no per-visitor record retained beyond 13 months',
],
```

### 3. Section 4 — replace the analytics bullet

```diff
-'Third-party analytics — no Google Analytics, no Matomo, no PostHog, no Plausible.',
+'Third-party analytics services — measurement happens on our own servers. No analytics vendor receives your data and no third-party script runs on this site.',
```

Leave the other four bullets untouched. They remain true and they are the ones carrying the
substance (no ads, no cross-site tracking, no social widgets, no persistent identifiers).

### 4. Section 4 — replace the commitment paragraph

```diff
-If we ever add optional analytics or any other non-essential technology, we will update this
-policy, display a consent banner with equally-visible "Accept" and "Reject" choices, and
-refrain from setting any non-essential storage until you click "Accept".
+Our usage measurement stores nothing on your device and cannot identify you, so there is
+nothing here for you to consent to or refuse. If we ever add a technology that does write to
+your device, or that could identify you across visits or across other sites, we will update
+this policy, display a consent banner with equally-visible "Accept" and "Reject" choices, and
+set nothing until you click "Accept".
```

### 5. Section 8 "Changes to this policy" — disclose the narrowing

Append:

> **Changed on `<date>`:** we added aggregate usage measurement that stores nothing on your
> device, and narrowed our consent-banner commitment so it now attaches to technologies that
> write to your device or could identify you, rather than to any non-essential technology.
> Previously we committed to a banner for any optional analytics. We are noting the change here
> rather than making it quietly, because it is a narrowing.

---

## Compliance checklist (verify at publish time)

- [ ] Every technology in use appears in the Section 3 table with name, type, purpose, retention
- [ ] Strictly-necessary vs consent-requiring distinction still explicit
- [ ] No retention exceeds 13 months; consent cookie, if ever added, defaults to 6 months
- [ ] If a banner ships, rejecting is exactly as easy as accepting (same level, same weight —
      this is what Google was fined €150M and Facebook €60M for getting wrong)
- [ ] `LAST_UPDATED` bumped
- [ ] Section 9 contact address still correct
- [ ] Claims re-verified against the shipped analytics code, not against this document

## Note on the skill used

Invoked `cookie-policy-malik-taiar`. Its drafting workflow is built for producing a French
CNIL-oriented policy as a `.docx` from a lawyer's template, which does not fit an existing
English React page governed primarily by PIPEDA, Quebec Law 25, and ePrivacy. What transferred
is its substantive compliance material: the CNIL 13-month retention ceiling and 6-month consent
default (both already correctly stated in the current policy), the reject-as-easy-as-accept
requirement and its enforcement history, and the completeness checklist above. Its central rule —
never draft from scratch, adapt the validated base — is why this is a set of surgical diffs
against the existing page rather than a rewrite.

**This is not legal advice.** A lawyer should review the narrowed commitment in Section 4 before
it is published, since it changes a public undertaking.
