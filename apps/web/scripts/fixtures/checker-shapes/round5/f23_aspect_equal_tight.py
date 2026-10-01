import numpy as np
import matplotlib
import matplotlib.pyplot as plt
fig, axs = plt.subplots(1, 3, figsize=(6.4, 2.6))
for p, ax in enumerate(axs, 1):
    ax.imshow(np.arange(25).reshape(5, 5))
    ax.set_aspect('equal')
    ax.set_title(f'T{p}_title', fontsize=8)
    ax.set_xlabel(f'X{p}_label', fontsize=8)
    ax.set_ylabel(f'Y{p}_label', fontsize=8)
    ax.tick_params(labelsize=7)
fig.tight_layout()
fig.savefig('f23.pdf')
