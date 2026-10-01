# round 6, the mpl reviewer's g13 (R6M-06): a colorbar shared by two Axes after tight_layout, sizes set by the script.
import numpy as np
import matplotlib.pyplot as plt
fig, axs = plt.subplots(1, 2, figsize=(6, 4.5))
for i, a in enumerate(axs):
    im = a.imshow(np.arange(64).reshape(8, 8) * (i + 1))
    a.set_title(f'Tt p{i}', fontsize=8); a.set_xlabel(f'Ax c{i}', fontsize=7); a.set_ylabel(f'Ax r{i}', fontsize=7)
    a.tick_params(labelsize=6)
fig.tight_layout()
cb = fig.colorbar(im, ax=list(axs), shrink=0.6)
cb.set_label('Ax shared', fontsize=7); cb.ax.tick_params(labelsize=6)
fig.savefig('s1.svg')
