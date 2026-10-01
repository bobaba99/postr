# round 6, skeptic-mpl-4's v04: a negative control for tick overlap (sharey columns; no overlap once fixed, round 6).
import matplotlib.pyplot as plt
fig, axs = plt.subplots(1, 3, figsize=(6, 4.5), sharey=True)
for i, a in enumerate(axs):
    a.plot([1, 2, 3], [10000, 20000 + i * 1000, 30000]); a.set_xlabel(f'Ax x{i}', fontsize=8); a.tick_params(labelsize=7)
axs[0].set_ylabel('Ax count', fontsize=8)
fig.tight_layout()
fig.savefig('s1.svg')
