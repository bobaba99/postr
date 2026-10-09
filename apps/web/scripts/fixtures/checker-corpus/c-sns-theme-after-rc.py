import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

plt.rcParams['font.size'] = 20          # bump every text for the poster
sns.set_theme(style="whitegrid")         # ...then pick a seaborn look

rng = np.random.default_rng(1)
df = pd.DataFrame({"dose": np.tile([0, 1, 2, 4], 30), "group": np.repeat(["placebo", "drug"], 60)})
df["response"] = df["dose"] * np.where(df["group"] == "drug", 1.5, 0.3) + rng.normal(0, 1, len(df))

fig, ax = plt.subplots(figsize=(6.4, 4.8))
sns.lineplot(data=df, x="dose", y="response", hue="group", ax=ax)
ax.set_title("Dose response")
ax.set_xlabel("Dose (mg/kg)")
ax.set_ylabel("Response (a.u.)")
fig.tight_layout()
fig.savefig("dose.png", dpi=300)
