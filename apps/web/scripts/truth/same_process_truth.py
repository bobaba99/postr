"""same_process_truth.py - two or more scripts run in ONE Python, one after the
other, as `%run` twice in a notebook or a runpy driver does: the text of every
figure at every save, measured after anything the scripts installed on
Figure.savefig has run (the instrument's own recorder is installed first, so
a script's wrap sits outside it), and what each script leaves in rcParams.
An instrument of scripts/checker-shape-check.mts (fix 13, step 9 round 4,
R4-08; round 5, R5-01; round 6: every class, the six keys Postr sets, after
each script).

Output (@@TRUTH@@ JSON):
  saves     the axis titles' sizes at each save, all scripts in order (R4-08)
  rc_after  the six rc keys Postr sets, after the last script
  scripts   per script: its error, and per save the smallest size of each
            text class (shape_truth's classes); `rc` the six keys and
            font.size as the script left them, `rc_pt` the same resolved to
            points at the font.size of that moment

The temporary folder the scripts run in is removed at exit (v6.1).

usage: python3 same_process_truth.py <script.py> <script.py> ...  -> @@TRUTH@@ JSON
"""
import atexit
import json
import os
import runpy
import shutil
import sys
import tempfile

os.environ["MPLBACKEND"] = "Agg"
from matplotlib.figure import Figure  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shape_truth import classes  # noqa: E402

KEYS = ("axes.titlesize", "axes.labelsize", "xtick.labelsize", "ytick.labelsize", "legend.fontsize", "legend.title_fontsize")
LISTED = ("plotTitle", "axisTitle", "axisText", "legendText", "caption", "legendTitle")
saves = []
per_script = []
orig = Figure.savefig


def record(self, *args, **kwargs):
    saves.append(sorted({round(label.get_fontsize(), 2) for ax in self.axes
                         for label in (ax.xaxis.label, ax.yaxis.label) if label.get_text().strip()}))
    if per_script:
        sizes = {cls: round(min(t.get_fontsize() for t in texts), 3)
                 for cls, texts in classes(self).items() if cls in LISTED and texts}
        per_script[-1]["saves"].append(sizes)
    return orig(self, *args, **kwargs)


def rc_now():
    import matplotlib
    from matplotlib.font_manager import FontProperties
    raw = {name: matplotlib.rcParams[name] for name in KEYS + ("font.size",)}
    pt = {name: round(float(FontProperties(size=value).get_size_in_points()), 3) for name, value in raw.items()}
    return raw, pt


Figure.savefig = record
paths = [os.path.abspath(p) for p in sys.argv[1:]]
home = tempfile.mkdtemp(prefix="postr_same_process_")
# Registered before the scripts run, so it runs after their own atexit handlers.
atexit.register(lambda: (os.chdir(os.path.dirname(home)), shutil.rmtree(home, ignore_errors=True)))
os.chdir(home)
error = None
for path in paths:
    per_script.append({"script": os.path.basename(path), "error": None, "saves": []})
    try:
        runpy.run_path(path, run_name="__main__")
    except SystemExit:
        pass
    except Exception as e:  # noqa: BLE001
        per_script[-1]["error"] = f"{type(e).__name__}: {e}"
        error = error or per_script[-1]["error"]
    per_script[-1]["rc"], per_script[-1]["rc_pt"] = rc_now()
    if error:
        break
import matplotlib  # noqa: E402

# What the scripts leave in rcParams for whatever runs next in this Python.
rc_after = {name: matplotlib.rcParams[name] for name in KEYS}
print("@@TRUTH@@" + json.dumps({"error": error, "saves": saves, "rc_after": rc_after, "scripts": per_script}))
