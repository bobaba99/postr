import numpy as np
import matplotlib.pyplot as plt

rng = np.random.default_rng(4)
groups = ['Placebo', 'Low dose', 'High dose']
means = [2.1, 2.9, 3.6]
fig, ax = plt.subplots(figsize=(7, 5))
for k, (g, m) in enumerate(zip(groups, means)):
    ax.errorbar(k, m, yerr=0.3, fmt='o', capsize=5, label=g)
ax.set_xticks(range(3))
ax.set_xlabel('Condition (arm)', fontsize=16)
ax.set_ylabel('Score (points)', fontsize=16)
ax.set_title('Scores by arm', fontsize=20)
ax.tick_params(labelsize=14)
ax.legend()
fig.savefig('arms.png', dpi=300)
