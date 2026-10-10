import numpy as np
import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt

plt.rcParams['font.size'] = 12
rng = np.random.default_rng(10)
n = 90
df = pd.DataFrame({"x": rng.normal(size=n), "cohort": np.repeat(["2019", "2020", "2021"], 30),
                   "sex": np.tile(["F", "M"], 45)})
df["y"] = df["x"] * 0.6 + rng.normal(0, 0.6, n)
g = sns.lmplot(data=df, x="x", y="y", col="cohort", hue="sex", height=4, aspect=1.1)
g.set_axis_labels("Baseline score", "Follow-up score")
g.savefig("lm.png", dpi=300)
