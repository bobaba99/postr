"""mpl_truth.py - what REAL matplotlib draws for a pasted plotting script:
the point size of every text element in the figure the script saves, and
that figure's canvas in inches. The ground truth for the plot checker
(scripts/checker-truth-check.mjs, plan item 13; record
docs/fixes/13-checker-reads-its-own-fix.md).

CLAIM it supports: "this script renders its axis titles at X pt, its tick
labels at Y pt ..." measured by drawing the figure and asking each Text
artist for its size - never by reading the script's text. It shares no
code and no rule with Postr's parser (apps/web/src/poster/readability.ts):
whatever rcParams, plt.rc, style or keyword set the size, the drawn
artist carries the result.

NEEDS Python >= 3.10 (TemporaryDirectory's ignore_cleanup_errors), with
matplotlib; --inline also needs matplotlib_inline and IPython.

HOW: python3 mpl_truth.py [--inline] <script.py>
  Runs the script with the Agg backend (runpy, as __main__) in a fresh
  temporary directory, removed afterwards. Figure.savefig, pyplot.savefig
  and pyplot.show are wrapped: each call draws the figure and records its
  size and, per text class, the SMALLEST rendered size among the visible,
  non-empty texts of that class. No file is written. The show() wrapper
  measures every open figure without making it the current one. If the
  script never saves or shows, every open figure is measured when it ends.
  Whatever the script prints goes to stderr, so stdout stays one JSON
  object.

  Each savefig call also records `saved`: the canvas savefig really writes,
  in inches. The figure is saved into memory as PNG with the call's own
  keywords (dpi, bbox_inches, pad_inches, ...; the format forced to PNG)
  and the PNG's pixel size is divided by the dpi used. With
  bbox_inches='tight' that is the cropped canvas, not the figure's.

  --inline: the same, but under the Jupyter inline backend
  (matplotlib_inline) and with pyplot.show NOT wrapped, so show() does what
  it does in a notebook cell: it displays every open figure and closes it.
  A savefig after show() then saves a new, empty figure (records `axes` 0).

  Text classes (the checker's rows): axisTitle (x/y axis labels), axisText
  (major tick labels; neither is counted for an Axes drawn with
  axis('off') or an Axis set invisible, which draw neither), plotTitle
  (Axes titles, centre/left/right),
  legendText, legendTitle, caption (fig.text / plt.figtext; not the
  suptitle or supx/ylabel), suptitle (information only), axesText (every
  text in Axes.texts: ax.text, ax.annotate, ax.bar_label; the checker has
  no row for it, nor for legendTitle).

python3 mpl_truth.py --selftest
  The instrument's own controls, no user script involved:
  A. known sizes read back: two scripts that set every class with an
     explicit fontsize= (one saving through Figure.savefig, one through
     pyplot.savefig and plt.figtext) must read back exactly those sizes
     and that canvas. Each smallest size sits where a partial runner would
     miss it: the y axis label and y ticks (not x), a left title (not the
     centre one) and a figure legend (not the Axes legend). A third script
     sets the legend title and three kinds of Axes text (text, annotate,
     bar_label) and must read back those sizes and the number of Axes
     texts; a fourth, drawn with axis('off'), must report no axis label
     and no tick label but its title; a fifth must save the figure that
     was current when show() ran;
  B. ink: in a real rendered figure, each measured text is painted pure
     red in turn and its ink height (the rows of red pixels in the Agg
     buffer, at 600 dpi) is compared with a 10 pt reference; the ink ratio
     must match the reported-size ratio within 3 %. This is what ties
     get_fontsize() to what is actually drawn, including sizes that come
     from rcParams names ('x-small', 'large');
  C. saved canvas: a plain save writes the figure's canvas; a tight save
     of a 4 x 3 in figure whose only artist is a rectangle over its middle
     half writes 2 x 1.5 in plus the padding (2.5 x 2 in with
     pad_inches=0.25), to the pixel;
  D. inline: under --inline, a savefig BEFORE show() saves the figure (1
     Axes) and a savefig AFTER show() saves an empty one (0 Axes).

OUTPUT: one JSON object on stdout.
  measure: {ok, error, matplotlib, inline, figures: [{w, h, axes, sizes:
    {class: pt or null}, counts: {class: n}, saved (savefig only): {w, h,
    dpi, tight} or {error}}]}
  selftest: {ok, matplotlib, checks: [{name, ok, expected, got}]}

EXIT CODES: 0 measured (or every self-test check held); 1 the script
  itself raised (ok false, error "Type: message" - a property of the
  script, e.g. a corrected script that does not run); 2 instrument failure
  (no figure to measure, a self-test check failed, or bad arguments).
"""
import contextlib
import io
import json
import os
import runpy
import struct
import sys
import tempfile

os.environ["MPLBACKEND"] = "Agg"
import matplotlib  # noqa: E402

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib._pylab_helpers import Gcf  # noqa: E402
from matplotlib.figure import Figure  # noqa: E402

CLASSES = ("axisTitle", "axisText", "plotTitle", "legendText", "legendTitle", "caption", "suptitle", "axesText")
INLINE_BACKEND = "module://matplotlib_inline.backend_inline"


def _ok(t):
    return t is not None and t.get_visible() and t.get_text().strip() != ""


def texts_by_class(fig):
    """Every visible, non-empty Text artist of the figure, by class."""
    cls = {k: [] for k in CLASSES}
    for ax in fig.axes:
        if not ax.get_visible():
            continue
        # ax.axis('off') or a hidden Axis draws no axis label and no tick
        # label, though those Text artists still report themselves visible.
        for axis, ticks in ((ax.xaxis, ax.get_xticklabels), (ax.yaxis, ax.get_yticklabels)):
            if not (ax.axison and axis.get_visible()):
                continue
            if _ok(axis.label):
                cls["axisTitle"].append(axis.label)
            cls["axisText"].extend(t for t in ticks() if _ok(t))
        for t in (ax.title, getattr(ax, "_left_title", None), getattr(ax, "_right_title", None)):
            if _ok(t):
                cls["plotTitle"].append(t)
        leg = ax.get_legend()
        if leg is not None and leg.get_visible():
            cls["legendText"].extend(t for t in leg.get_texts() if _ok(t))
            if _ok(leg.get_title()):
                cls["legendTitle"].append(leg.get_title())
        cls["axesText"].extend(t for t in ax.texts if _ok(t))
    for leg in fig.legends:
        if leg.get_visible():
            cls["legendText"].extend(t for t in leg.get_texts() if _ok(t))
            if _ok(leg.get_title()):
                cls["legendTitle"].append(leg.get_title())
    sup = [getattr(fig, n, None) for n in ("_suptitle", "_supxlabel", "_supylabel")]
    for t in fig.texts:
        if any(t is s for s in sup):
            continue
        if _ok(t):
            cls["caption"].append(t)
    if _ok(sup[0]):
        cls["suptitle"].append(sup[0])
    return cls


def measure(fig):
    fig.canvas.draw()  # tick labels exist only after a draw
    cls = texts_by_class(fig)
    w, h = fig.get_size_inches()
    return {
        "w": float(w),
        "h": float(h),
        "axes": len(fig.axes),
        "sizes": {k: (round(min(t.get_fontsize() for t in v), 4) if v else None) for k, v in cls.items()},
        "counts": {k: len(v) for k, v in cls.items()},
    }


def open_figures():
    """Every open pyplot figure, by number, WITHOUT making it the current
    one (plt.figure(n) would, and a later plt.savefig would then save it)."""
    return [m.canvas.figure for m in sorted(Gcf.get_all_fig_managers(), key=lambda m: m.num)]


def saved_canvas(save, fig, kw):
    """The canvas `save` (the real Figure.savefig) writes for these keywords,
    in inches: saved into memory as PNG, pixel size / dpi used."""
    kw = {k: v for k, v in kw.items() if k != "format"}
    dpi = kw.get("dpi") or matplotlib.rcParams["savefig.dpi"]
    if dpi == "figure":
        dpi = fig.dpi
    kw["dpi"] = dpi
    tight = kw.get("bbox_inches", matplotlib.rcParams["savefig.bbox"]) == "tight"
    try:
        buf = io.BytesIO()
        save(fig, buf, format="png", **kw)
        w, h = struct.unpack(">II", buf.getvalue()[16:24])
    except Exception as e:  # a keyword PNG cannot take; reported, not guessed
        return {"error": f"{type(e).__name__}: {e}", "tight": tight}
    return {"w": w / float(dpi), "h": h / float(dpi), "dpi": float(dpi), "tight": tight}


def run_script(path, inline=False):
    """Run a user script under the wrappers; return (ok, error, records)."""
    records = []
    measured = set()
    if inline:
        plt.switch_backend(INLINE_BACKEND)
    orig = (Figure.savefig, plt.savefig, plt.show)

    def _savefig(self, *a, **k):
        rec = measure(self)
        rec["saved"] = saved_canvas(orig[0], self, k)
        records.append(rec)
        measured.add(id(self))

    def _show(*a, **k):
        for f in open_figures():
            if id(f) not in measured:
                records.append(measure(f))
                measured.add(id(f))

    Figure.savefig = _savefig
    # As pyplot does (gcf().savefig): through the class attribute, so a
    # wrap a script installs on Figure.savefig runs for plt.savefig too.
    plt.savefig = lambda *a, **k: plt.gcf().savefig(*a, **k)
    if not inline:
        plt.show = _show
    cwd = os.getcwd()
    script = os.path.abspath(os.path.join(cwd, path))
    ok, err = True, None
    with tempfile.TemporaryDirectory(prefix="mpl_truth_", ignore_cleanup_errors=True) as tmp:
        os.chdir(tmp)
        try:
            with contextlib.redirect_stdout(sys.stderr):
                runpy.run_path(script, run_name="__main__")
        except SystemExit:
            pass
        except Exception as e:  # the script itself failed
            ok, err = False, f"{type(e).__name__}: {e}"
        finally:
            os.chdir(cwd)
            Figure.savefig, plt.savefig, plt.show = orig
    if ok and not records:
        for f in open_figures():
            records.append(measure(f))
    plt.close("all")
    if inline:
        plt.switch_backend("Agg")
    matplotlib.rcdefaults()
    return ok, err, records


# ------------------------------------------------------------------ self-test
KNOWN_A = """
import matplotlib.pyplot as plt
fig, ax = plt.subplots(figsize=(7.3, 5.1))
ax.plot([0, 1, 2], [1, 3, 2], label='Series one')
# The y axis is smaller than the x axis on purpose: a runner that read
# only the x axis would report 19 and 14.5 here.
ax.set_xlabel('Time (min)', fontsize=19)
ax.set_ylabel('Response', fontsize=17.5)
ax.tick_params(axis='x', labelsize=14.5)
ax.tick_params(axis='y', labelsize=13.25)
ax.set_title('Known sizes', fontsize=21)
ax.legend(fontsize=11.5, title='Group', title_fontsize=12.5)
fig.text(0.01, 0.01, 'Note: made-up data.', fontsize=9.75)
# Smaller than the caption on purpose: a suptitle wrongly counted as a
# caption must change the caption's minimum, or this check cannot see it.
fig.suptitle('Figure 1', fontsize=8.5)
fig.savefig('known.png', dpi=300)
"""
EXPECT_A = {"w": 7.3, "h": 5.1, "sizes": {"axisTitle": 17.5, "axisText": 13.25, "plotTitle": 21.0,
            "legendText": 11.5, "legendTitle": 12.5, "caption": 9.75, "suptitle": 8.5},
            "counts": {"axisTitle": 2}}

KNOWN_B = """
import matplotlib.pyplot as plt
plt.figure(figsize=(5.5, 4.25))
plt.plot([0, 1], [0, 1], label='Series one')
plt.xlabel('Dose (mg)', fontsize=15)
plt.ylabel('Response', fontsize=15)
plt.xticks(fontsize=8.5)
plt.yticks(fontsize=8.5)
plt.title('Pyplot sizes', fontsize=16.5)
# Smaller than the centre title and the Axes legend on purpose: a runner
# that missed left titles or figure legends would report 16.5 and 7.25.
plt.gca().set_title('Left', loc='left', fontsize=15.5)
plt.legend(fontsize=7.25)
plt.gcf().legend(fontsize=6.75)
plt.figtext(0.01, 0.01, 'Caption text', fontsize=6.5)
plt.savefig('known.png')
"""
EXPECT_B = {"w": 5.5, "h": 4.25, "sizes": {"axisTitle": 15.0, "axisText": 8.5, "plotTitle": 15.5,
            "legendText": 6.75, "legendTitle": None, "caption": 6.5, "suptitle": None, "axesText": None},
            "counts": {"plotTitle": 2, "legendText": 2}}

# ax.axis('off') draws no axis label and no tick label (their Text artists
# still say visible); the title is still drawn.
KNOWN_D = """
import matplotlib.pyplot as plt
fig, ax = plt.subplots(figsize=(4, 3))
ax.imshow([[0, 1], [1, 0]])
ax.set_xlabel('Hidden label', fontsize=5)
ax.tick_params(labelsize=4)
ax.axis('off')
ax.set_title('Shown title', fontsize=20)
fig.savefig('off.png')
"""
EXPECT_D = {"w": 4.0, "h": 3.0, "sizes": {"axisTitle": None, "axisText": None, "plotTitle": 20.0}}

# Figure 1 is current when show() runs, so the plt.savefig after it saves
# figure 1 (3 x 2 in, title 9 pt): measuring must not make figure 2 current.
KNOWN_E = """
import matplotlib.pyplot as plt
plt.figure(1, figsize=(3, 2)); plt.plot([0, 1]); plt.title('One', fontsize=9)
plt.figure(2, figsize=(5, 4)); plt.plot([0, 1]); plt.title('Two', fontsize=11)
plt.figure(1)
plt.show()
plt.savefig('one.png')
"""
EXPECT_E = {"w": 3.0, "h": 2.0, "sizes": {"plotTitle": 9.0}}

# The texts the checker has no row for: a legend title and three kinds of
# Axes text. The smallest Axes text is the plain ax.text, so a runner that
# missed ax.text would read 7.25 (bar_label), and one that missed the
# others would count fewer than 5.
KNOWN_C = """
import matplotlib.pyplot as plt
fig, ax = plt.subplots(figsize=(6.5, 4.5))
bars = ax.bar([0, 1, 2], [2, 3, 4], label='Series one')
ax.bar_label(bars, fontsize=7.25)
ax.text(0.2, 3.5, 'n = 12', fontsize=6.5)
ax.annotate('peak', xy=(2, 4), xytext=(1.2, 4.3), fontsize=8.75)
ax.legend(fontsize=11, title='Group', title_fontsize=9.5)
fig.savefig('known.png')
"""
EXPECT_C = {"w": 6.5, "h": 4.5, "sizes": {"legendText": 11.0, "legendTitle": 9.5, "axesText": 6.5, "caption": None},
            "counts": {"axesText": 5, "legendTitle": 1}}

# Saved canvas. The only artist of TIGHT_A is a rectangle over the middle
# half of a 4 x 3 in figure, so a tight save writes 2 x 1.5 in plus
# pad_inches on each side; PLAIN_B writes the figure's own canvas.
TIGHT_A = """
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
fig = plt.figure(figsize=(4, 3))
fig.add_artist(Rectangle((0.25, 0.25), 0.5, 0.5, transform=fig.transFigure, linewidth=0))
fig.savefig('a.png', dpi=100, bbox_inches='tight', pad_inches=0.25)
"""
PLAIN_B = """
import matplotlib.pyplot as plt
plt.figure(figsize=(4, 3))
plt.plot([0, 1], [0, 1])
plt.savefig('b.png', dpi=150)
"""
SAVE_THEN_SHOW = """
import matplotlib.pyplot as plt
plt.figure(figsize=(4, 3))
plt.plot([0, 1], [0, 1])
plt.title('Saved first')
plt.savefig('c.png', dpi=100)
plt.show()
"""
SHOW_THEN_SAVE = SAVE_THEN_SHOW.replace("plt.savefig('c.png', dpi=100)\nplt.show()", "plt.show()\nplt.savefig('c.png', dpi=100)")


def _run_src(src, inline=False):
    fd, path = tempfile.mkstemp(suffix=".py", prefix="mpl_truth_known_")
    with os.fdopen(fd, "w") as f:
        f.write(src)
    try:
        return run_script(path, inline=inline)
    finally:
        os.unlink(path)


def _known(name, src, expect):
    ok, err, recs = _run_src(src)
    got = recs[-1] if recs else None
    good = ok and got is not None and abs(got["w"] - expect["w"]) < 1e-9 and abs(got["h"] - expect["h"]) < 1e-9 \
        and all((got["sizes"][k] is None and v is None) or (v is not None and got["sizes"][k] is not None
                and abs(got["sizes"][k] - v) < 1e-6) for k, v in expect["sizes"].items()) \
        and all(got["counts"][k] == n for k, n in expect.get("counts", {}).items())
    return {"name": name, "ok": bool(good), "expected": expect, "got": got, "error": err}


def _saved(name, src, expect):
    """The last savefig's written canvas equals `expect` (w, h, tight) to within one pixel."""
    ok, err, recs = _run_src(src)
    sv = recs[-1].get("saved") if recs else None
    good = ok and sv is not None and "error" not in sv and sv["tight"] == expect["tight"] \
        and abs(sv["w"] - expect["w"]) <= 1 / sv["dpi"] + 1e-9 and abs(sv["h"] - expect["h"]) <= 1 / sv["dpi"] + 1e-9
    return {"name": name, "ok": bool(good), "expected": expect, "got": sv, "error": err}


def _inline(name, src, axes):
    """Under --inline, the last savefig records a figure with `axes` Axes."""
    ok, err, recs = _run_src(src, inline=True)
    saves = [r for r in recs if "saved" in r]
    got = saves[-1]["axes"] if saves else None
    return {"name": name, "ok": bool(ok and got == axes), "expected": axes, "got": got, "error": err}


def _ink_rows(fig, target):
    """Height in pixels of `target`'s ink, painted pure red, in the Agg buffer."""
    import numpy as np
    old = target.get_color()
    target.set_color((1.0, 0.0, 0.0))
    fig.canvas.draw()
    buf = np.asarray(fig.canvas.buffer_rgba())[:, :, :3].astype(int)
    target.set_color(old)
    red = (buf[:, :, 0] > 150) & (buf[:, :, 1] < 110) & (buf[:, :, 2] < 110)
    rows = np.where(red.any(axis=1))[0]
    return int(rows[-1] - rows[0] + 1) if rows.size else 0


def _ink():
    """Reported sizes against painted ink, for sizes that come from rcParams names."""
    checks = []
    with matplotlib.rc_context({"font.size": 20, "xtick.labelsize": "x-small", "axes.labelsize": "large",
                                "legend.fontsize": 7.5, "axes.titlesize": "small"}):
        fig, ax = plt.subplots(figsize=(6, 4), dpi=600)
        # Room for every target inside the canvas: a label cut off at the
        # canvas edge measures short (the axis label did, before this).
        fig.subplots_adjust(left=0.1, right=0.95, bottom=0.35, top=0.75)
        ax.plot([0, 1], [0, 1], label="HH")  # C0 blue: no red in the figure but the target
        ax.set_xticks([0.5], ["HH"])
        ax.set_yticks([])
        ax.set_xlabel("HH")
        ax.set_title("HH")
        ax.legend(loc="upper left")
        ref = fig.text(0.02, 0.92, "HH", fontsize=10)
        fig.canvas.draw()
        targets = {
            "axisText (x-small of 20)": ax.get_xticklabels()[0],
            "axisTitle (large of 20)": ax.xaxis.label,
            "plotTitle (small of 20)": ax.title,
            "legendText (7.5)": ax.get_legend().get_texts()[0],
        }
        ref_px = _ink_rows(fig, ref)
        for name, t in targets.items():
            px = _ink_rows(fig, t)
            want = t.get_fontsize() / ref.get_fontsize()
            got = px / ref_px if ref_px else 0
            checks.append({"name": f"ink {name}", "ok": abs(got / want - 1) <= 0.03 if want else False,
                           "expected": round(want, 4), "got": round(got, 4),
                           "error": None, "detail": {"reportedPt": round(t.get_fontsize(), 4), "inkPx": px, "refPx": ref_px}})
        plt.close(fig)
    return checks


def selftest():
    checks = [_known("known sizes via Figure.savefig", KNOWN_A, EXPECT_A),
              _known("known sizes via pyplot.savefig + figtext", KNOWN_B, EXPECT_B),
              _known("known legend title and Axes texts", KNOWN_C, EXPECT_C),
              _known("known hidden axis: axis('off')", KNOWN_D, EXPECT_D),
              _known("known current figure kept through show()", KNOWN_E, EXPECT_E)]
    checks.extend(_ink())
    checks.extend([
        _saved("saved canvas: tight save of a known extent", TIGHT_A, {"w": 2.5, "h": 2.0, "tight": True}),
        _saved("saved canvas: plain save is the figure", PLAIN_B, {"w": 4.0, "h": 3.0, "tight": False}),
        _inline("inline: savefig before show() saves the figure", SAVE_THEN_SHOW, 1),
        _inline("inline: savefig after show() saves an empty figure", SHOW_THEN_SAVE, 0),
    ])
    ok = all(c["ok"] for c in checks)
    print(json.dumps({"ok": ok, "matplotlib": matplotlib.__version__, "checks": checks}))
    return 0 if ok else 2


def main(argv):
    args = argv[1:]
    inline = args[:1] == ["--inline"]
    if inline:
        args = args[1:]
    if len(args) != 1:
        print(json.dumps({"ok": False, "error": "usage: mpl_truth.py [--inline] <script.py> | --selftest"}))
        return 2
    if args[0] == "--selftest" and not inline:
        return selftest()
    ok, err, recs = run_script(args[0], inline=inline)
    print(json.dumps({"ok": ok, "error": err, "matplotlib": matplotlib.__version__, "inline": inline, "figures": recs}))
    if not ok:
        return 1
    return 0 if recs else 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
