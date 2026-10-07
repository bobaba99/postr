import numpy as np
import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt

plt.rcParams['font.size'] = 12
rng = np.random.default_rng(9)
df = pd.DataFrame({"height": rng.normal(170, 8, 200)})
df["weight"] = df["height"] * 0.9 - 85 + rng.normal(0, 6, 200)
g = sns.jointplot(data=df, x="height", y="weight", height=8)
g.set_axis_labels("Height (cm)", "Weight (kg)")
g.savefig("joint.png", dpi=300)
