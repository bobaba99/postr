import numpy as np
import matplotlib
import matplotlib.pyplot as plt
fig, axs = plt.subplots(2, 2, figsize=(6.4, 4.8))
for p, ax in enumerate(axs.flat, 1):
    ax.plot([1, 2, 3], [3, 1, 2])
    ax.set_title(f'T{p}_title', fontsize=8)
    ax.set_xlabel(f'X{p}_label', fontsize=8)
    ax.set_ylabel(f'Y{p}_label', fontsize=8)
    ax.tick_params(labelsize=7)
fig.tight_layout()
ins = fig.add_axes([0.62, 0.62, 0.12, 0.12])
ins.plot([0, 1], [0, 1])
ins.tick_params(labelsize=6)
fig.savefig('f12.pdf')
