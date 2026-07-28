# Bug log

One file per confirmed bug, newest by filename date. This folder is for
**real, reproduced bugs** — a defect a user hit, traced to a root cause,
and (usually) fixed. It is deliberately separate from `docs/issues/`,
which holds older performance/known-issue notes.

## Why keep this

A fixed bug is cheap to forget and expensive to reintroduce. Each entry
records what actually happened, why, and how it was proven fixed — so the
next person (or the next refactor) does not walk back into it. Pairs with
the feature-flow graph in `.code-review-graph/`: the graph says what a
change touches; this log says what has already gone wrong there.

## File naming

`YYYY-MM-DD-short-slug.md` — the date the bug was diagnosed.

## Template

```markdown
# <One-line title>

- **Date:** YYYY-MM-DD
- **Status:** Fixed | Open | Mitigated
- **Severity:** how bad, and how many users
- **Fixed in:** <commit sha / PR>, or "not yet"
- **Area:** the feature/subsystem

## Symptom
What the user saw, verbatim where possible.

## Root cause
The actual mechanism, with `file:line`. Not the first guess — the
verified cause.

## Why it was hard to see
What made it silent / intermittent / non-obvious, if anything.

## Fix
What changed and why that is the right seam.

## Verification
How the fix was proven — tests, live repro, before/after.

## Prevention
Regression test added, guardrail, or note for future work.
```
