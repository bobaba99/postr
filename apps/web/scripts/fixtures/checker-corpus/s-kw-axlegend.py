import numpy as np
import matplotlib.pyplot as plt

rng = np.random.default_rng(7)
fig, ax = plt.subplots(figsize=(6, 4))
for k, name in enumerate(['Placebo', 'Low', 'High']):
    ax.scatter(rng.normal(k, 0.3, 30), rng.normal(k, 0.5, 30), label=name, s=12)
ax.set_xlabel('Baseline score (z)', fontsize=12)
ax.set_ylabel('Follow-up score (z)', fontsize=12)
ax.tick_params(labelsize=10)
ax.legend(fontsize=7)
fig.savefig('scatter.png', dpi=300)
