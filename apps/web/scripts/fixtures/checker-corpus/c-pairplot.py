import numpy as np
import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt

plt.rcParams['font.size'] = 12
rng = np.random.default_rng(11)
df = pd.DataFrame(rng.normal(size=(120, 3)), columns=["alpha", "beta", "gamma"])
df["species"] = np.repeat(["setosa", "virginica", "versicolor"], 40)
g = sns.pairplot(df, hue="species", height=3)
g.savefig("pairs.png", dpi=300)
