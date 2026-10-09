import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

sns.set_context("paper")
rng = np.random.default_rng(3)
df = pd.DataFrame({"x": rng.normal(size=120), "kind": np.repeat(["a", "b", "c"], 40)})
df["y"] = df["x"] * 0.8 + rng.normal(0, 0.5, 120)

fig, ax = plt.subplots(figsize=(6.4, 4.8))
sns.scatterplot(data=df, x="x", y="y", hue="kind", ax=ax)
ax.set_title("Paper context")
ax.set_xlabel("Predictor")
ax.set_ylabel("Outcome")
fig.savefig("paper.png", dpi=300)
