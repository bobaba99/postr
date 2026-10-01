# round 6, skeptic-mpl-4's v06 (R6M-04): sharex columns of three rows, small explicit tick labels.
import matplotlib.pyplot as plt
fig, axs = plt.subplots(3, 2, figsize=(6, 4.5), sharex='col')
for k, a in enumerate(axs.flat):
    a.plot([1000, 5000, 9000], [k, 2, 1]); a.tick_params(labelsize=6)
for a in axs[2]: a.set_xlabel('Ax dose', fontsize=8)
fig.tight_layout()
fig.savefig('s1.svg')
