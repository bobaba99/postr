import numpy as np
import matplotlib.pyplot as plt

plt.rcParams['font.size'] = 16
plt.rcParams['axes.labelsize'] = 11
plt.rcParams['axes.titlesize'] = 12
plt.rcParams['legend.fontsize'] = 9
plt.rcParams['xtick.labelsize'] = 9
plt.rcParams['ytick.labelsize'] = 9

rng = np.random.default_rng(3)
fig, ax = plt.subplots(figsize=(7, 5))
for g in ['WT', 'KO']:
    ax.hist(rng.normal(0 if g == 'WT' else 1, 1, 200), bins=20, alpha=0.6, label=g)
ax.set_xlabel('Expression (log2 FC)')
ax.set_ylabel('Cells')
ax.set_title('Expression by genotype')
ax.legend()
fig.savefig('hist.png', dpi=300)
