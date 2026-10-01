import numpy as np
import matplotlib
import matplotlib.pyplot as plt
fig, axs = plt.subplots(1, 3, figsize=(6.4, 2.4))
for p, ax in enumerate(axs, 1):
    ax.plot([1, 2, 3], [3, 1, 2])
    ax.set_title(f'T{p}_title', fontsize=8)
    ax.set_xlabel(f'X{p}_label', fontsize=8)
    ax.set_ylabel(f'Y{p}_label', fontsize=8)
    ax.tick_params(labelsize=7)
fig.subplots_adjust(left=0.08, right=0.98, bottom=0.2, top=0.88, wspace=0.35)
fig.savefig('f15.pdf')
