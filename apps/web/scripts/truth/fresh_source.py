"""fresh_source.py - the layout grid's FRESH-LAYOUT control (harness v6.2): the
ideal control (ideal_source.py: the original script with the listed sizes at
their source) with the script's OWN last tight_layout call, with the same
arguments, and the subplots_adjust calls the script made after it, run again
right before every save. What the script's own layout gives once it is
current for the text the figure has at the save. An instrument of
scripts/checker-shape-check.mts (fix 13); ported from the independent check
of v6.1 (fix13-out/harness-v6-1-check/work/fresh/make_fresh.py, finding 2).

Why: the STALE rule judges a save whose figure changed after its own last
tight_layout in the original run. v6.1 bounded the fix there by the original
alone; the original's layout is the stale one, so a fix that brings the layout
up to date pays for the sizes, and the original cannot say what that costs.
The ideal keeps the stale layout too. This control does what an author who
re-ran their own layout at the save would get: the stale bound is
max(original, fresh) + slack (layout.mts).

It is not derived from the fix: nothing of Postr's block is used, and no
Postr module is read. The replay is Figure.tight_layout and
Figure.subplots_adjust, recorded per figure:
  - each tight_layout call (the script's, or a library's like seaborn's grids)
    starts the record again with that call and its arguments;
  - each subplots_adjust after it is added to the record (tight_layout's own
    internal subplots_adjust lands in the record it then replaces, so it does
    not count);
  - at every Figure.savefig (an animation's frames too), when the figure has
    no layout engine that runs at draw (none, or the placeholder that
    tight_layout leaves), the record is played again, then the save runs.
A figure with no tight_layout call is saved as the ideal saves it.

Order: layout_truth.py replaces Figure.savefig and Figure.tight_layout before
the script runs, and this block runs as the script's first statements, so the
save it wraps is layout_truth's measuring save (the measure sees the replayed
layout) and the tight_layout it replays is layout_truth's spy (the stale
record of THIS control is not used by the harness).

usage: python3 fresh_source.py <ideal.py> <out.py>
"""
import ast
import sys

BLOCK = '''
from matplotlib.figure import Figure as _fresh_Figure
_fresh_tight_of, _fresh_adjust_of, _fresh_save_of = (
    _fresh_Figure.tight_layout, _fresh_Figure.subplots_adjust, _fresh_Figure.savefig)


def _fresh_tight(self, *args, **kwargs):
    result = _fresh_tight_of(self, *args, **kwargs)
    if not getattr(self, "_fresh_busy", False):
        self._fresh_steps = [("tight", args, kwargs)]
    return result


def _fresh_adjust(self, *args, **kwargs):
    result = _fresh_adjust_of(self, *args, **kwargs)
    if getattr(self, "_fresh_steps", None) and not getattr(self, "_fresh_busy", False):
        self._fresh_steps.append(("adjust", args, kwargs))
    return result


def _fresh_save(self, *args, **kwargs):
    from matplotlib.layout_engine import PlaceHolderLayoutEngine
    steps = getattr(self, "_fresh_steps", None)
    engine = self.get_layout_engine()
    if steps and (engine is None or isinstance(engine, PlaceHolderLayoutEngine)):
        self._fresh_busy = True
        try:
            for kind, a, k in steps:
                (_fresh_tight_of if kind == "tight" else _fresh_adjust_of)(self, *a, **k)
        finally:
            self._fresh_busy = False
    return _fresh_save_of(self, *args, **kwargs)


_fresh_Figure.tight_layout, _fresh_Figure.subplots_adjust, _fresh_Figure.savefig = (
    _fresh_tight, _fresh_adjust, _fresh_save)
'''


def is_docstring(stmt):
    return isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Constant) and isinstance(stmt.value.value, str)


def fresh(code):
    """The block after the module docstring and any __future__ import, as ideal_source.py places its helpers."""
    tree = ast.parse(code)
    head = 1 if tree.body and is_docstring(tree.body[0]) else 0
    while head < len(tree.body) and isinstance(tree.body[head], ast.ImportFrom) and tree.body[head].module == "__future__":
        head += 1
    tree.body = tree.body[:head] + ast.parse(BLOCK).body + tree.body[head:]
    ast.fix_missing_locations(tree)
    out = ast.unparse(tree) + "\n"
    compile(out, "<fresh>", "exec")
    return out


if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    with open(src, encoding="utf-8") as fh:
        code = fh.read()
    with open(dst, "w", encoding="utf-8") as fh:
        fh.write(fresh(code))
