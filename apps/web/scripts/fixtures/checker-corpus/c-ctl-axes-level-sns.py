import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

plt.rcParams['font.size'] = 15
rng = np.random.default_rng(13)
df = pd.DataFrame({"arm": np.repeat(["low", "mid", "high"], 30), "sex": np.tile(["F", "M"], 45)})
df["y"] = rng.normal(0, 1, 90) + np.repeat([0, 0.5, 1.0], 30)
fig, ax = plt.subplots(figsize=(6.4, 4.8))
sns.violinplot(data=df, x="arm", y="y", hue="sex", split=True, ax=ax)
ax.set_title("Axes-level seaborn")
ax.set_xlabel("Arm")
ax.set_ylabel("Outcome (z)")
ax.tick_params(labelsize=13)
fig.savefig("violin.png", dpi=300)
