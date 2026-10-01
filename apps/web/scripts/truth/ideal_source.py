"""ideal_source.py - the layout grid's ideal control: the ORIGINAL script with
the needed sizes applied at their source, as an author asking for them would
write it. An instrument of scripts/checker-shape-check.mts (fix 13, step 9
round 6; the critic's ideal43 did this by hand for six scripts).

It is not derived from the fix: nothing of Postr's block is used. The script's
own code lays its text out (its tight_layout, its colorbars, its hand-placed
Axes), with every listed text already at its size.

  - Explicit sizes: a size argument of a listed class becomes max(value,
    need), in the calls of the table METHODS (set_title, set_xlabel,
    set_ylabel, set_zlabel, tick_params, set_xticklabels, plt.xticks,
    legend, colorbar set_label, seaborn's set_titles / set_axis_labels /
    move_legend / add_legend, pandas' plot(fontsize=) for tick labels), and in
    a `fontdict` or `prop` dict.
  - LISTED CLASSES ONLY (v6.1): plot titles, axis titles, tick labels, legend
    text and captions, as the checker lists them. A legend's title is not a
    listed class: its `title_fontsize` and legend.title_fontsize keep the
    script's own values (v6 raised them "as the fix treats it", which copied
    the fix into its own control; the independent check of v6, finding 1).
    Every other unlisted text keeps its size too: suptitles, Axes texts,
    and fig.supxlabel / supylabel (the fix counts sup labels as axis titles;
    the checker does not list them, and shape_truth.py classes them apart,
    as supLabel).
  - rc and context values: matplotlib reads each listed rc key as max(the
    value the script's rcParams hold at that moment, need). The value is
    resolved when it is read, so rc_context / style.context / rcParams[...] =
    / sns.set_theme / rcdefaults values all count, and a relative "large"
    under a bigger font.size wins when it is bigger. The script's own values
    stay in rcParams (a context restores them). Keys: axes.titlesize (plot
    titles), axes.labelsize (axis titles; not figure.labelsize, the sup
    labels'), x/ytick.labelsize (tick labels), legend.fontsize (legend
    text; not legend.title_fontsize).
  - Figure texts (fig.text, plt.figtext: captions) get max(their size, need)
    when captions are listed; an Axes' text (ax.text) is not a listed class.

Limits, visible rather than hidden: a size set through a Text's
set_fontsize / set_size, plt.setp, or a FontProperties object stays as the
script wrote it, and a copy of rcParams the script takes itself (a saved
dict, seaborn's context managers) holds the raised values. The harness checks
the ideal against the need at every save and prints IDEAL SHORT where a
listed text falls below it.

usage: python3 ideal_source.py <script.py> '<need json>' <out.py>
  need: {"plotTitle": 20, "axisTitle": 20, "axisText": 15, "legendText": 15, "caption": 12}
"""
import ast
import json
import sys

RC = {
    "plotTitle": ["axes.titlesize"],
    "axisTitle": ["axes.labelsize"],  # sup labels are not listed (v6.1)
    "axisText": ["xtick.labelsize", "ytick.labelsize"],
    "legendText": ["legend.fontsize"],  # a legend title is not listed (v6.1)
}
# method name -> {size keyword: class}
METHODS = {
    "set_title": {"fontsize": "plotTitle", "size": "plotTitle"},
    "title": {"fontsize": "plotTitle", "size": "plotTitle"},
    "set_titles": {"fontsize": "plotTitle", "size": "plotTitle"},
    "set_xlabel": {"fontsize": "axisTitle", "size": "axisTitle"},
    "set_ylabel": {"fontsize": "axisTitle", "size": "axisTitle"},
    "set_zlabel": {"fontsize": "axisTitle", "size": "axisTitle"},
    "xlabel": {"fontsize": "axisTitle", "size": "axisTitle"},
    "ylabel": {"fontsize": "axisTitle", "size": "axisTitle"},
    "set_label": {"fontsize": "axisTitle", "size": "axisTitle"},
    "set_axis_labels": {"fontsize": "axisTitle", "size": "axisTitle"},
    "tick_params": {"labelsize": "axisText"},
    "set_tick_params": {"labelsize": "axisText"},
    "set_xticklabels": {"fontsize": "axisText", "size": "axisText"},
    "set_yticklabels": {"fontsize": "axisText", "size": "axisText"},
    "set_zticklabels": {"fontsize": "axisText", "size": "axisText"},
    "xticks": {"fontsize": "axisText", "size": "axisText"},
    "yticks": {"fontsize": "axisText", "size": "axisText"},
    "plot": {"fontsize": "axisText"},
    "hist": {"xlabelsize": "axisText", "ylabelsize": "axisText"},
    "legend": {"fontsize": "legendText"},
    "add_legend": {"fontsize": "legendText"},
    "move_legend": {"fontsize": "legendText"},
    "figtext": {"fontsize": "caption", "size": "caption"},
}
# keyword -> (class for the method, keys of the dict that are sizes)
DICT_KWARGS = {"fontdict": ("fontsize", "size"), "prop": ("size",)}

HELPERS = '''
import matplotlib as _ideal_mpl


def _ideal_pt(value):
    from matplotlib.font_manager import FontProperties
    if value is None:
        return float(_ideal_mpl.rcParams["font.size"])
    return float(FontProperties(size=value).get_size_in_points())


def _ideal_size(value, need):
    """max(value, need): the value when it is at least the need, else the need."""
    return need if _ideal_pt(value) < need else value


def _ideal_dict(d, keys, need):
    if not isinstance(d, dict):
        return d
    d = dict(d)
    for key in keys:
        if key in d:
            d[key] = _ideal_size(d[key], need)
    return d


def _ideal_text(receiver, method, need, *args, **kwargs):
    """fig.text is a caption, raised to the need; ax.text is not a listed class."""
    from matplotlib.figure import FigureBase
    if isinstance(receiver, FigureBase):
        own = kwargs.pop("fontsize", kwargs.pop("size", None))
        kwargs["fontsize"] = _ideal_size(own, need)
    return getattr(receiver, method)(*args, **kwargs)


def _ideal_install(need):
    """matplotlib reads each listed rc key as max(the value held now, need)."""
    params = _ideal_mpl.RcParams
    get = params.__getitem__

    def __getitem__(self, key):
        value = get(self, key)
        if key in need and self is _ideal_mpl.rcParams and _ideal_pt(value) < need[key]:
            return need[key]
        return value

    params.__getitem__ = __getitem__
'''


def helper(name, *args):
    return ast.Call(func=ast.Name(id=name, ctx=ast.Load()), args=list(args), keywords=[])


def num(v):
    return ast.Constant(value=v)


class Ideal(ast.NodeTransformer):
    def __init__(self, need):
        self.need = need

    def size_expr(self, value, cls):
        need = self.need[cls]
        if isinstance(value, ast.Constant) and isinstance(value.value, (int, float)) and not isinstance(value.value, bool):
            return num(max(value.value, need))
        return helper("_ideal_size", value, num(need))

    def visit_Call(self, node):
        self.generic_visit(node)
        name = node.func.attr if isinstance(node.func, ast.Attribute) else getattr(node.func, "id", None)
        # fig.text / subfig.text / ax.text: decided at run time by the receiver.
        if name == "text" and isinstance(node.func, ast.Attribute) and "caption" in self.need:
            return ast.Call(func=ast.Name(id="_ideal_text", ctx=ast.Load()),
                            args=[node.func.value, num("text"), num(self.need["caption"])] + node.args,
                            keywords=node.keywords)
        table = METHODS.get(name)
        if not table:
            return node
        cls_of_call = next(iter(set(table.values())))
        sized = False
        for kw in node.keywords:
            if kw.arg in table and table[kw.arg] in self.need:
                kw.value = self.size_expr(kw.value, table[kw.arg])
                sized = sized or table[kw.arg] == cls_of_call
            elif kw.arg in DICT_KWARGS and cls_of_call in self.need:
                keys = DICT_KWARGS[kw.arg]
                if isinstance(kw.value, ast.Dict):
                    kw.value.values = [self.size_expr(v, cls_of_call) if isinstance(k, ast.Constant) and k.value in keys else v
                                       for k, v in zip(kw.value.keys, kw.value.values)]
                else:
                    kw.value = helper("_ideal_dict", kw.value, ast.Tuple(elts=[num(k) for k in keys], ctx=ast.Load()),
                                      num(self.need[cls_of_call]))
        # plt.figtext without a size: a caption at the need.
        if name == "figtext" and "caption" in self.need and not sized:
            node.keywords.append(ast.keyword(arg="fontsize", value=helper("_ideal_size", num(None), num(self.need["caption"]))))
        return node


def is_docstring(stmt):
    return isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Constant) and isinstance(stmt.value.value, str)


def ideal(code, need):
    tree = Ideal(need).visit(ast.parse(code))
    head = 1 if tree.body and is_docstring(tree.body[0]) else 0
    while head < len(tree.body) and isinstance(tree.body[head], ast.ImportFrom) and tree.body[head].module == "__future__":
        head += 1
    rc = {key: need[cls] for cls, keys in RC.items() if cls in need for key in keys}
    helpers = ast.parse(HELPERS + f"\n_ideal_install({json.dumps(rc)})\n").body
    tree.body = tree.body[:head] + helpers + tree.body[head:]
    ast.fix_missing_locations(tree)
    out = ast.unparse(tree) + "\n"
    compile(out, "<ideal>", "exec")
    return out


if __name__ == "__main__":
    src, need_json, dst = sys.argv[1], sys.argv[2], sys.argv[3]
    need = {k: v for k, v in json.loads(need_json).items() if v}
    with open(src, encoding="utf-8") as fh:
        code = fh.read()
    with open(dst, "w", encoding="utf-8") as fh:
        fh.write(ideal(code, need))
