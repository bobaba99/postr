# Fix records

One record per fix in the September plan (`docs/stress-test/PLAN.md`), written
so someone who wasn't there can check every claim. Each record follows the same
order:

1. **Symptom** — what the researcher sees, in their words.
2. **Hypotheses** — each cause stated as a claim with the prediction that would
   confirm or refute it, including at least one alternative.
3. **Method** — the committed script(s) that test the hypotheses, the command to
   re-run them, where they enter (the user's entry point), and what they do not
   cover.
4. **Results before the fix** — the numbers each prediction produced.
5. **Independent confirmation** — two reviewers who did not use the author's
   scripts, each with its own method AND its own scope, confirming or refuting
   the defect before anything was changed. Their scopes are split so they test
   different things (for example: the claim as stated and its cause; its
   siblings, other entry points and alternative causes), never the same checks
   with a different tool. The record states the split. The same applies to the
   reviews of the fix (section 9).
6. **Root cause** — the mechanism, with file references, and what it does not
   explain.
7. **Fix** — what changed and why that shape.
8. **Results after the fix** — the same scripts re-run, plus falsification
   (revert the fix, confirm the tests go red).
9. **Review of the fix** — findings and what was done about them.
10. **Limits and follow-ups** — what the fix does not cover.

Evidence tiers used throughout: **MEASURED** (a number from a re-runnable
command), **TESTED** (a test that fails without the fix), **INSPECTED** (read the
code; nothing ran), **UNVERIFIED** (not reproduced).
