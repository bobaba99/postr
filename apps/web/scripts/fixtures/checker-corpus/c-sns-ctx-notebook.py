import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

sns.set_context("notebook")
rng = np.random.default_rng(4)
df = pd.DataFrame({"cond": np.repeat(["rest", "task", "recovery"], 25)})
df["rt"] = rng.normal(500, 60, 75) + np.repeat([0, 80, 20], 25)

fig, ax = plt.subplots(figsize=(6.4, 4.8))
sns.boxplot(data=df, x="cond", y="rt", hue="cond", ax=ax, legend=True)
ax.set_title("Reaction time by condition")
ax.set_xlabel("Condition")
ax.set_ylabel("RT (ms)")
fig.savefig("rt.png", dpi=300)
