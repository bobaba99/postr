import numpy as np
import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt

plt.rcParams['font.size'] = 12
rng = np.random.default_rng(12)
df = pd.DataFrame({"latency": rng.gamma(4, 50, 300), "device": np.repeat(["phone", "laptop", "tablet"], 100)})
g = sns.displot(data=df, x="latency", hue="device", kind="kde", height=6, aspect=1.6)
g.set_axis_labels("Latency (ms)", "Density")
g.savefig("latency.png", dpi=300)
