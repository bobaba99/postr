# round 6, skeptic-mpl-4's g48 (R6M-04): shared axes whose hidden tick labels keep the small size, so the shared locator spaces the raised ones for it.
import matplotlib.pyplot as plt
fig, axs = plt.subplots(2, 2, figsize=(6, 4.5), sharex='col', sharey='row')
for k, a in enumerate(axs.flat):
    a.plot([10000, 20000, 30000], [k * 1000, 2500, 1200]); a.tick_params(labelsize=7)
for a in axs[1]: a.set_xlabel('Ax count', fontsize=8)
for a in axs[:, 0]: a.set_ylabel('Ax value', fontsize=8)
fig.tight_layout()
fig.savefig('s1.svg')
