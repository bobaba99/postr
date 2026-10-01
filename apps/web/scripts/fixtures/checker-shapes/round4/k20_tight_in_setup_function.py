import numpy as np
import matplotlib.pyplot as plt


def make_canvas():
    fig, axs = plt.subplots(2, 2, figsize=(6.4, 4.8))
    fig.tight_layout()
    return fig, axs


fig, axs = make_canvas()
for i, ax in enumerate(axs.flat):
    ax.plot(np.arange(8), np.arange(8) * (i + 1), label='trend')
    ax.set_title(f'Site {i + 1}')
    ax.set_xlabel('Month')
    ax.set_ylabel('Count')
    ax.legend()
fig.savefig('sites.png', dpi=150)
