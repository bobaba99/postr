import numpy as np
import matplotlib
import matplotlib.pyplot as plt
fig, axs = plt.subplots(1, 2, figsize=(6.4, 3.2))
for p, ax in enumerate(axs, 1):
    im = ax.imshow(np.arange(16).reshape(4, 4))
    ax.set_title(f'T{p}_title', fontsize=8)
    ax.set_xlabel(f'X{p}_label', fontsize=8)
    ax.set_ylabel(f'Y{p}_label', fontsize=8)
    ax.tick_params(labelsize=7)
fig.tight_layout()
for ax in axs:
    cb = fig.colorbar(im, ax=ax)
    cb.set_label('CB_label', fontsize=8)
fig.savefig('f10.pdf')
