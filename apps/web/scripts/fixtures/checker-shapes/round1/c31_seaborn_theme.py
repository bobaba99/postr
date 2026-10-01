import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt

sns.set_theme(context="paper", style="whitegrid")
df = pd.DataFrame({"x": [1, 2, 3, 4], "y": [2, 1, 4, 3], "g": ["a", "a", "b", "b"]})
fig, ax = plt.subplots(figsize=(6.4, 4.8))
sns.lineplot(data=df, x="x", y="y", hue="g", ax=ax)
ax.set_xlabel("x")
ax.set_ylabel("y")
ax.set_title("Seaborn paper")
fig.savefig("sns.png")
