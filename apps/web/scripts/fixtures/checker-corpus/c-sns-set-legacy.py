import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

sns.set(font_scale=0.7)   # older seaborn idiom, still common in lab code
rng = np.random.default_rng(7)
df = pd.DataFrame({"year": np.tile(np.arange(2010, 2020), 2), "src": np.repeat(["survey", "registry"], 10)})
df["rate"] = 5 + np.cumsum(rng.normal(0, 0.4, 20))

fig, ax = plt.subplots(figsize=(6.4, 4.8))
sns.lineplot(data=df, x="year", y="rate", hue="src", ax=ax)
ax.set_title("Incidence")
ax.set_xlabel("Year")
ax.set_ylabel("Rate per 100k")
fig.savefig("rate.png", dpi=300)
