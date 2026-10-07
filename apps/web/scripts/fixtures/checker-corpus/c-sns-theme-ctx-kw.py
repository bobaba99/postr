import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

sns.set_theme(context="paper", style="white")
rng = np.random.default_rng(6)
df = pd.DataFrame({"g": np.repeat(["ctrl", "ko"], 50), "v": rng.normal(0, 1, 100)})

fig, ax = plt.subplots(figsize=(6.4, 4.8))
sns.histplot(data=df, x="v", hue="g", ax=ax)
ax.set_title("Distribution")
ax.set_xlabel("Expression (z)")
ax.set_ylabel("Cells")
fig.savefig("hist.png", dpi=300)
