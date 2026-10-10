import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

# talk context, but keep the titles and labels compact
sns.set_context("talk", rc={"axes.titlesize": 9, "axes.labelsize": 9})
rng = np.random.default_rng(5)
df = pd.DataFrame({"t": np.tile(np.arange(10), 2), "arm": np.repeat(["A", "B"], 10)})
df["v"] = np.cumsum(rng.normal(0, 1, 20))

fig, ax = plt.subplots(figsize=(6.4, 4.8))
sns.lineplot(data=df, x="t", y="v", hue="arm", ax=ax)
ax.set_title("Talk context, compact labels")
ax.set_xlabel("Time (s)")
ax.set_ylabel("Value")
fig.savefig("talk.png", dpi=300)
