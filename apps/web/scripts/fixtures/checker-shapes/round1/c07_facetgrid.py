import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt

df = pd.DataFrame({
    "x": [1, 2, 3, 4, 1, 2, 3, 4],
    "y": [2, 3, 5, 4, 1, 2, 2, 3],
    "grp": ["a"] * 4 + ["b"] * 4,
    "kind": ["u", "v"] * 4,
})
g = sns.FacetGrid(df, col="grp", hue="kind", height=3, aspect=1.2)
g.map(plt.plot, "x", "y")
g.add_legend()
g.set_axis_labels("time (s)", "signal")
g.set_titles("{col_name}")
g.savefig("facet.png")
