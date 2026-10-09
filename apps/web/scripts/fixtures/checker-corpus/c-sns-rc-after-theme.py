import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

sns.set_theme(style="ticks")
plt.rcParams["font.size"] = 20           # make the text poster-sized

rng = np.random.default_rng(2)
df = pd.DataFrame({"week": np.tile(np.arange(8), 3), "site": np.repeat(["north", "south", "east"], 8)})
df["count"] = rng.poisson(20, len(df)) + df["week"] * 3

fig, ax = plt.subplots(figsize=(6.4, 4.8))
sns.barplot(data=df, x="week", y="count", hue="site", ax=ax)
ax.set_title("Weekly counts")
ax.set_xlabel("Week")
ax.set_ylabel("Count")
fig.tight_layout()
fig.savefig("counts.png", dpi=300)
