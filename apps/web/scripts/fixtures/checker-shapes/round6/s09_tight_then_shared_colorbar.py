# round 6, the page reviewer's s09 (R6P-05): a colorbar shared by two Axes after tight_layout, sizes set by the script.
import matplotlib.pyplot as plt
import numpy as np

z = np.outer(np.linspace(0, 1, 30), np.linspace(0, 1, 40))
fig, axes = plt.subplots(1, 2, figsize=(6.4, 3.2))
for i, ax in enumerate(axes):
    im = ax.imshow(z ** (i + 1), aspect='auto')
    ax.set_title(f'Power {i + 1}', fontsize=8)
    ax.set_xlabel('column index', fontsize=8)
    ax.set_ylabel('row index', fontsize=8)
    ax.tick_params(labelsize=7)
fig.tight_layout()
fig.colorbar(im, ax=axes, shrink=0.9, label='value')
fig.savefig('s09.png', dpi=100)
