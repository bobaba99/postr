"""layout_truth.py - what a grown text does to a figure's layout, at each save:
the layout grid of scripts/checker-shape-check.mts (fix 13,
docs/fixes/13-checker-reads-its-own-fix.md, round 3, R3-02; written by the
step 9 reviewer; tick labels and the figures left open added in round 6).

At every Figure.savefig, after a draw, measures in square inches of the
saved canvas:
  clip_in2    text area outside the figure (cut off in a plain savefig)
  cross_in2   overlap between the text of one Axes (title, axis labels, tick
              labels) and the tight box of ANOTHER Axes (panels colliding)
  figleg_in2  overlap of figure legends / suptitle with any Axes tight box
  overlap_in2 overlap between the boxes of the Axes themselves (a colorbar
              or a panel drawn over another; step 9 round 4, R4-01)
  tick_in2    overlap between the tick labels of the same Axis, of the labels
              actually drawn (the ticks inside the view), in ink: each pair
              whose boxes meet is drawn alone and the pixels both inked are
              counted (round 6, R6M-03, R6M-04). tick_box_in2: the same from
              the boxes alone. ticks: per Axis, [Axes index, axis name,
              labels drawn, ink in2, box in2] where either is non-zero
  axes        each Axes' box in inches (x0, y0, x1, y1), to see a panel moved
  placed      every Axes, an Axes' children (insets) included, in the order
              of all_axes(): [kind, x0, y0, x1, y1, parent, px0, py0, px1,
              py1, pw, ph] (v6.1). kind: "grid" (a subplotspec, in the
              layout), "out" (a subplotspec, taken out of the layout:
              set_position), "free" (no subplotspec: add_axes, plt.axes, a
              cax= colorbar's Axes), "child" (an inset: an Axes' child),
              "cbar" (a colorbar's Axes made from its parents, ax=, with no
              subplotspec: it follows them). The box in inches; for a child,
              parent is the parent's index, (px0 .. py1) the box in the
              parent's Axes fraction and (pw, ph) the parent's size in inches
  sizes       the smallest size of each text class drawn (shape_truth's
              classes), so a control can be checked against the need
  stale       the save's figure changed since its last tight_layout call
              (v6.1): resized, or a title (centre, left or right), axis
              label, legend text or title, suptitle, sup label or figure
              text added, removed, or changed in its text or size (tick
              labels, which follow the data, aside). `stale_why` says what.
              A layout engine runs again at every draw, so a figure with one
              at the save (set_layout_engine after the call, layout=) never
              goes stale; a figure with no tight_layout call is never stale
and the subplot parameters (left, right, bottom, top, wspace, hspace).
Text measured for clip and cross: each Axes' title, its left and right
titles (v6.1; v6 measured the centre one only), axis labels and the tick
labels drawn.

After the script ends, in the same Python, each pyplot figure still open is
measured twice more (`after`): as a notebook displays it (drawn on its
canvas, not through Figure.savefig) and saved again through Figure.savefig
(what a later cell's save does; a wrap the script installed runs outside this
recorder). A tick locator re-spaces the ticks for the rcParams of that moment
(round 6, R6M-03).

The temporary folder the script runs in is removed at exit, after any save
the script left to atexit (v6.1).

usage: python3 layout_truth.py <script.py>  -> @@TRUTH@@ JSON on stdout
"""
import atexit
import io
import json
import os
import shutil
import runpy
import sys
import tempfile

os.environ["MPLBACKEND"] = "Agg"
import matplotlib  # noqa: E402

matplotlib.use("Agg")
import numpy as np  # noqa: E402
from matplotlib.backends.backend_agg import RendererAgg  # noqa: E402
from matplotlib.figure import Figure  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shape_truth import classes  # noqa: E402

recs = []
after = []
orig = Figure.savefig
LISTED = ("plotTitle", "axisTitle", "axisText", "legendText", "caption", "legendTitle")


def inter(a, b):
    w = min(a.x1, b.x1) - max(a.x0, b.x0)
    h = min(a.y1, b.y1) - max(a.y0, b.y0)
    return max(w, 0) * max(h, 0)


def drawn_tick_labels(axis):
    """The tick labels matplotlib draws: the ticks inside the view interval."""
    ticks = axis._update_ticks()
    return [lab for tk in ticks for lab in (tk.label1, tk.label2) if lab.get_visible() and lab.get_text().strip()]


def ax_texts(ax):
    out = [ax.title, getattr(ax, "_left_title", None), getattr(ax, "_right_title", None), ax.xaxis.label, ax.yaxis.label]
    for axis in (ax.xaxis, ax.yaxis):
        out += drawn_tick_labels(axis)
    return [t for t in out if t is not None and t.get_visible() and t.get_text().strip()]


def all_axes(fig):
    axes = list(fig.axes)
    for ax in axes:
        axes += [child for child in getattr(ax, "child_axes", []) if child not in axes]
    return axes


def placed(fig, r):
    """Each Axes' kind and box (see `placed` above)."""
    axes = all_axes(fig)
    parent_of = {id(c): i for i, ax in enumerate(axes) for c in getattr(ax, "child_axes", [])}
    dpi = fig.dpi
    out = []
    for ax in axes:
        spec = ax.get_subplotspec() if hasattr(ax, "get_subplotspec") else None
        if id(ax) in parent_of:
            kind = "child"
        elif spec is not None:
            kind = "grid" if ax.get_in_layout() else "out"
        elif hasattr(ax, "_colorbar_info"):
            kind = "cbar"
        else:
            kind = "free"
        b = ax.get_window_extent(r)
        row = [kind] + [round(v / dpi, 3) for v in (b.x0, b.y0, b.x1, b.y1)]
        if kind == "child":
            i = parent_of[id(ax)]
            pb = axes[i].get_window_extent(r)
            fx = [(v - pb.x0) / pb.width for v in (b.x0, b.x1)] if pb.width else [0, 0]
            fy = [(v - pb.y0) / pb.height for v in (b.y0, b.y1)] if pb.height else [0, 0]
            row += [i, round(fx[0], 4), round(fy[0], 4), round(fx[1], 4), round(fy[1], 4),
                    round(pb.width / dpi, 3), round(pb.height / dpi, 3)]
        out.append(row)
    return out


def layout_texts(fig):
    """What a tight_layout lays out that the script can add or change:
    the figure's size and its titles, labels, legends and figure texts."""
    texts = []

    def add(kind, t):
        if t is not None and t.get_visible() and t.get_text().strip():
            texts.append((kind, t.get_text(), round(float(t.get_fontsize()), 3)))

    def legend(kind, lg):
        if lg is not None and lg.get_visible():
            for t in lg.get_texts():
                add(kind, t)
            add(kind + " title", lg.get_title())

    for n, ax in enumerate(all_axes(fig)):
        for t in (ax.title, getattr(ax, "_left_title", None), getattr(ax, "_right_title", None)):
            add(f"ax{n} title", t)
        for axis in (ax.xaxis, ax.yaxis, getattr(ax, "zaxis", None)):
            if axis is not None:
                add(f"ax{n} label", axis.label)
        legend(f"ax{n} legend", ax.get_legend())
    parts = [fig] + list(getattr(fig, "subfigs", []))
    for part in parts:
        for lg in part.legends:
            legend("figure legend", lg)
        for t in part.texts:
            add("figure text", t)
    return {"size": [round(float(v), 4) for v in fig.get_size_inches()], "texts": sorted(texts)}


def staleness(fig):
    """Why the figure's last tight_layout no longer fits it; None when it does,
    and None when a layout engine runs at every draw (one set after the call,
    like constrained layout: the layout is made again for the save)."""
    then = getattr(fig, "_truth_tight_state", None)
    if then is None:
        return None
    from matplotlib.layout_engine import PlaceHolderLayoutEngine
    engine = fig.get_layout_engine() if hasattr(fig, "get_layout_engine") else None
    if engine is not None and not isinstance(engine, PlaceHolderLayoutEngine):
        return None
    now = layout_texts(fig)
    why = []
    if now["size"] != then["size"]:
        why.append(f"resized {then['size']} -> {now['size']}")
    added = [t for t in now["texts"] if t not in then["texts"]]
    gone = [t for t in then["texts"] if t not in now["texts"]]
    if added:
        why.append(f"{len(added)} text(s) added or changed, e.g. {added[0][0]} {added[0][1][:20]!r}")
    if gone:
        why.append(f"{len(gone)} text(s) gone or changed")
    return "; ".join(why) or None


def tick_overlaps(fig, r):
    """Per Axis, the ink and box overlap of its drawn tick labels, in px^2."""
    w, h = int(round(fig.bbox.width)), int(round(fig.bbox.height))
    masks = {}

    def ink(t):
        if id(t) not in masks:
            rr = RendererAgg(w, h, fig.dpi)
            t.draw(rr)
            masks[id(t)] = np.asarray(rr.buffer_rgba())[..., 3] > 16
        return masks[id(t)]

    rows = []
    for ai, ax in enumerate(all_axes(fig)):
        for name in ("x", "y", "z"):
            axis = getattr(ax, f"{name}axis", None)
            if axis is None:
                continue
            try:
                labels = drawn_tick_labels(axis)
            except Exception:  # noqa: BLE001 - an Axis without the private method
                continue
            boxes = [t.get_window_extent(r) for t in labels]
            box = ink_px = 0.0
            for i in range(len(labels)):
                for j in range(i + 1, len(labels)):
                    a = inter(boxes[i], boxes[j])
                    if a > 0:
                        box += a
                        ink_px += float((ink(labels[i]) & ink(labels[j])).sum())
            rows.append((ai, name, len(labels), ink_px, box))
    return rows


def measure(fig):
    fig.canvas.draw()
    r = fig.canvas.get_renderer()
    dpi = fig.dpi
    fb = fig.bbox
    clip = 0.0
    cross = 0.0
    tight = [ax.get_tightbbox(r) for ax in fig.axes]
    for i, ax in enumerate(fig.axes):
        for t in ax_texts(ax):
            bb = t.get_window_extent(r)
            clip += bb.width * bb.height - inter(bb, fb)
            for j, tb in enumerate(tight):
                if j != i and not (ax.bbox.overlaps(fig.axes[j].bbox)):
                    cross += inter(bb, tb)
    boxes = [lg.get_window_extent(r) for lg in fig.legends]
    if getattr(fig, "_suptitle", None) is not None:
        boxes.append(fig._suptitle.get_window_extent(r))
    figleg = sum(inter(b, x) for b in boxes for x in tight)
    frames = [ax.get_window_extent(r) for ax in fig.axes]
    overlap = sum(inter(frames[i], frames[j]) for i in range(len(frames)) for j in range(i + 1, len(frames)))
    sp = fig.subplotpars
    ticks = tick_overlaps(fig, r)
    stale = staleness(fig)
    px = dpi * dpi
    sizes = {}
    for cls, texts in classes(fig).items():
        if cls in LISTED and texts:
            sizes[cls] = round(min(t.get_fontsize() for t in texts), 3)
    return {"clip_in2": round(clip / px, 3), "cross_in2": round(cross / px, 3),
            "figleg_in2": round(figleg / px, 3),
            "overlap_in2": round(overlap / px, 3),
            "tick_in2": round(sum(t[3] for t in ticks) / px, 4),
            "tick_box_in2": round(sum(t[4] for t in ticks) / px, 4),
            "ticks": [[a, n, k, round(i / px, 4), round(b / px, 4)] for a, n, k, i, b in ticks if i or b],
            "axes": [[round(v / dpi, 3) for v in (f.x0, f.y0, f.x1, f.y1)] for f in frames],
            "sizes": sizes,
            "placed": placed(fig, r),
            "stale": stale is not None, "stale_why": stale,
            "sp": [round(sp.left, 3), round(sp.right, 3), round(sp.bottom, 3), round(sp.top, 3),
                   round(sp.wspace, 3), round(sp.hspace, 3)]}


phase = {"after": None}


def on_agg(fig, work):
    # A Figure made without pyplot, or one a PDF canvas printed, has no canvas
    # that draws: work on a lent Agg canvas, then give the old one back.
    own = fig.canvas
    if not hasattr(own, "get_renderer"):
        from matplotlib.backends.backend_agg import FigureCanvasAgg
        FigureCanvasAgg(fig)
    try:
        return work()
    finally:
        if fig.canvas is not own:
            fig.set_canvas(own)


def measure_on_agg(fig):
    return on_agg(fig, lambda: measure(fig))


def save(self, *a, **k):
    def work():
        rec = measure(self)
        if phase["after"] is None:
            recs.append(rec)
        else:
            after.append({**rec, "fig": phase["after"], "how": "resave"})
        return orig(self, *a, **k)
    return on_agg(self, work)


def figures_left_open():
    """Each pyplot figure still open, displayed, then saved again (R6M-03)."""
    import matplotlib.pyplot as plt
    for n in plt.get_fignums():
        fig = plt.figure(n)
        after.append({**measure_on_agg(fig), "fig": n, "how": "display"})
        phase["after"] = n
        try:
            fig.savefig(io.BytesIO(), format="png")
        finally:
            phase["after"] = None


def tight_spy(self, *a, **k):
    """The figure's state as its tight_layout leaves it (the stale criterion)."""
    result = orig_tight(self, *a, **k)
    self._truth_tight_state = layout_texts(self)
    return result


orig_tight = Figure.tight_layout
Figure.savefig = save
Figure.tight_layout = tight_spy
p = os.path.abspath(sys.argv[1])
home = tempfile.mkdtemp(prefix="postr_layout_truth_")
# Registered before the script runs, so it runs after the script's own
# atexit handlers (a save left to atexit lands in the folder first).
atexit.register(lambda: (os.chdir(os.path.dirname(home)), shutil.rmtree(home, ignore_errors=True)))
os.chdir(home)
err = None
after_err = None
try:
    runpy.run_path(p, run_name="__main__")
except SystemExit:
    pass
except Exception as e:  # noqa: BLE001
    err = f"{type(e).__name__}: {e}"
if err is None:
    try:
        figures_left_open()
    except Exception as e:  # noqa: BLE001
        after_err = f"{type(e).__name__}: {e}"
print("@@TRUTH@@" + json.dumps({"error": err, "saves": recs, "after": after, "after_error": after_err}))
