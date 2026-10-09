import numpy as np
import matplotlib.pyplot as plt

plt.rcParams['font.size'] = 18
groups = ["WT", "KO1", "KO2", "Rescue"]
vals = [1.0, 0.4, 0.5, 0.9]
fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.bar(range(4), vals)
ax.set_xticks(range(4), labels=groups, fontsize=7)
ax.set_yticks([0, 0.5, 1.0], labels=["0", "0.5", "1.0"], fontsize=7)
ax.set_title("Relative expression")
ax.set_xlabel("Genotype")
ax.set_ylabel("Fold change")
fig.savefig("ticks.png", dpi=300)
