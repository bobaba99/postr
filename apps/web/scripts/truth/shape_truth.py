"""shape_truth.py - what real matplotlib draws, at each save, for one script:
the instrument of scripts/checker-shape-check.mts (fix 13,
docs/fixes/13-checker-reads-its-own-fix.md; written by the step 9 reviewers).

Runs a script in real matplotlib (Agg) and, at every Figure.savefig call
(plt.savefig, fig.savefig, PdfPages.savefig and seaborn's Grid.savefig all
end there), draws the figure and records every visible, non-empty Text by
class, in traversal order, THEN lets the real savefig run (into a temp dir),
so the save path itself is exercised. With no save, plt.show() is measured;
with neither, every open figure at the end.

Order matters for the checker's own fix: this script replaces
Figure.savefig before the measured script runs, so the fix's
_postr_install() wraps THIS replacement, and the text is measured after the
fix has raised it, as the real save would draw it.

Blind spot: a figure printed through its canvas (fig.canvas.print_figure)
never reaches Figure.savefig, so it is measured at the end of the run, not
at the print. The checker's re-check withholds its credit for such a script.

Classes beyond the checker's five, so over-raising and misses are visible:
  axisTextMinor  minor tick labels (log axes)
  supLabel       fig.supxlabel / fig.supylabel
  suptitle       fig.suptitle
  subLegendText  legends made on a SubFigure
  subText        fig.text-style texts on a SubFigure (excluding its suptitle)
  annot          Axes-level texts (ax.text / annotate)

What the run wrote (v6.1, the SAVES judgement): `saves`, the calls that
reached the real Figure.savefig (to a file, a buffer, or a writer's frame);
`saved`, the files in the run's folder with their pages (a PDF's pages, an
animated image's frames, 1 for any other file). A save the script left to
atexit is not counted (it runs after this report), for the original and the
fixed script alike. The warnings are collected even when the script ends
with sys.exit (v6.1; v6 lost them). The run's temporary folder is removed at
exit, after any atexit save.

usage: python3 shape_truth.py <script.py>  -> JSON on stdout
"""
import atexit
import json
import os
import re
import runpy
import shutil
import sys
import tempfile
import warnings

os.environ["MPLBACKEND"] = "Agg"
import matplotlib  # noqa: E402

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.figure import Figure  # noqa: E402

CLASSES = ("plotTitle", "axisTitle", "axisText", "legendText", "caption",
           "legendTitle", "axisTextMinor", "supLabel", "suptitle",
           "subLegendText", "subText", "annot")


def _ok(t):
    return t is not None and t.get_visible() and t.get_text().strip() != ""


def _subfigs(fig):
    out = []
    for sf in getattr(fig, "subfigs", []):
        out.append(sf)
        out.extend(_subfigs(sf))
    return out


def classes(fig):
    c = {k: [] for k in CLASSES}
    # Inset Axes (ax.inset_axes) are an Axes' children, not the figure's.
    axes_all = list(fig.axes)
    for ax in axes_all:
        axes_all += [child for child in getattr(ax, "child_axes", []) if child not in axes_all]
    for ax in axes_all:
        if not ax.get_visible():
            continue
        for t in (ax.title, getattr(ax, "_left_title", None), getattr(ax, "_right_title", None)):
            if _ok(t):
                c["plotTitle"].append(t)
        # A 3D Axes has a third axis, drawn like the other two.
        axes_ = [a for a in (ax.xaxis, ax.yaxis, getattr(ax, "zaxis", None)) if a is not None]
        for axis in axes_:
            if _ok(axis.label):
                c["axisTitle"].append(axis.label)
            for tl in axis.get_ticklabels():
                if _ok(tl):
                    c["axisText"].append(tl)
            for tl in axis.get_ticklabels(minor=True):
                if _ok(tl):
                    c["axisTextMinor"].append(tl)
        leg = ax.get_legend()
        if leg is not None and leg.get_visible():
            c["legendText"].extend(t for t in leg.get_texts() if _ok(t))
            if _ok(leg.get_title()):
                c["legendTitle"].append(leg.get_title())
        c["annot"].extend(t for t in ax.texts if _ok(t))
    for leg in fig.legends:
        if leg.get_visible():
            c["legendText"].extend(t for t in leg.get_texts() if _ok(t))
            if _ok(leg.get_title()):
                c["legendTitle"].append(leg.get_title())
    sup = getattr(fig, "_suptitle", None)
    sx = [getattr(fig, "_supxlabel", None), getattr(fig, "_supylabel", None)]
    for t in fig.texts:
        if t is sup:
            continue
        if any(t is s for s in sx):
            if _ok(t):
                c["supLabel"].append(t)
            continue
        if _ok(t):
            c["caption"].append(t)
    if _ok(sup):
        c["suptitle"].append(sup)
    for sf in _subfigs(fig):
        for leg in sf.legends:
            c["subLegendText"].extend(t for t in leg.get_texts() if _ok(t))
        ssup = getattr(sf, "_suptitle", None)
        c["subText"].extend(t for t in sf.texts if t is not ssup and _ok(t))
    return c


def measure(fig, tag):
    # A Figure made without pyplot has no canvas that draws until its save
    # lends it one: draw on a lent Agg canvas, then give the old one back.
    own = fig.canvas
    if not hasattr(own, "get_renderer"):
        from matplotlib.backends.backend_agg import FigureCanvasAgg
        FigureCanvasAgg(fig)
    try:
        fig.canvas.draw()
    finally:
        if fig.canvas is not own:
            fig.set_canvas(own)
    c = classes(fig)
    w, h = fig.get_size_inches()
    return {"tag": tag, "fig": fig.number if hasattr(fig, "number") else None,
            "w": round(float(w), 4), "h": round(float(h), 4),
            "sizes": {k: [round(t.get_fontsize(), 3) for t in v] for k, v in c.items()},
            "texts": {k: [t.get_text()[:20] for t in v] for k, v in c.items() if k in ("caption", "supLabel", "subText", "annot")}}


def pages(path):
    """A PDF's pages, an animated image's frames, else 1 (a file is a page)."""
    try:
        if path.lower().endswith(".pdf"):
            with open(path, "rb") as fh:
                return max(1, len(re.findall(rb"/Type\s*/Page(?![a-zA-Z])", fh.read())))
        if path.lower().endswith((".gif", ".tif", ".tiff", ".webp", ".apng")):
            from PIL import Image
            with Image.open(path) as im:
                return int(getattr(im, "n_frames", 1))
    except Exception:  # noqa: BLE001 - an unreadable file still counts once
        return 1
    return 1


def written(folder):
    """Every file under the run's folder: [relative path, pages]."""
    out = []
    for root, _dirs, files in os.walk(folder):
        for name in files:
            full = os.path.join(root, name)
            out.append([os.path.relpath(full, folder), pages(full)])
    return sorted(out)


def run(path):
    recs = []
    seen = set()
    calls = [0]
    orig_save, orig_show = Figure.savefig, plt.show
    tmp = tempfile.mkdtemp(prefix="postr_shape_truth_")
    # Registered before the script runs, so it runs after the script's own
    # atexit handlers (a save left to atexit lands in the folder first).
    atexit.register(lambda: (os.chdir(os.path.dirname(tmp)), shutil.rmtree(tmp, ignore_errors=True)))

    def _save(self, *a, **k):
        recs.append(measure(self, "savefig"))
        seen.add(id(self))
        calls[0] += 1
        return orig_save(self, *a, **k)

    def _show(*a, **k):
        for n in plt.get_fignums():
            f = plt.figure(n)
            if id(f) not in seen:
                recs.append(measure(f, "show"))
                seen.add(id(f))

    Figure.savefig = _save
    plt.show = _show
    cwd = os.getcwd()
    os.chdir(tmp)
    ok, err = True, None
    wl = []
    try:
        with warnings.catch_warnings(record=True) as wl:
            warnings.simplefilter("always")
            runpy.run_path(os.path.abspath(os.path.join(cwd, path)), run_name="__main__")
    except SystemExit:
        pass
    except BaseException as e:  # noqa: BLE001
        ok, err = False, f"{type(e).__name__}: {e}"
    finally:
        # The run stays in its temporary folder: a save the script left to
        # atexit then lands there, not in the tree (step 9 round 5, R5-12).
        Figure.savefig, plt.show = orig_save, orig_show
        # Read after the block, however it ended: a script that ends with
        # sys.exit still gave its warnings (v6.1).
        caught = [f"{w.category.__name__}: {str(w.message)[:120]}" for w in (wl or [])]
    if ok and not recs:
        for n in plt.get_fignums():
            recs.append(measure(plt.figure(n), "end"))
    plt.close("all")
    matplotlib.rcdefaults()
    saved = written(tmp)
    # Every distinct warning: the harness's LAYOUT WARNING rule reads them all
    # (round 6: they were cut to eight, and a ninth went unseen).
    return {"ok": ok, "error": err, "figures": recs, "saves": calls[0], "saved": saved,
            "warnings": sorted(set(caught))}


if __name__ == "__main__":
    print("@@TRUTH@@" + json.dumps(run(sys.argv[1])))
