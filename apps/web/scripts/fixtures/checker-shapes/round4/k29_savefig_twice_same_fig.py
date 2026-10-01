import numpy as np
import matplotlib.pyplot as plt

fig, axs = plt.subplots(2, 2, figsize=(6.4, 4.8))
for i, ax in enumerate(axs.flat):
    ax.plot(np.arange(6), np.arange(6) * (i + 1), label='v')
    ax.set_title(f'Q{i + 1}')
    ax.set_xlabel('Input level')
    ax.set_ylabel('Output level')
    ax.legend()
fig.tight_layout(h_pad=0.2)
fig.savefig('q.png', dpi=100)
fig.savefig('q.pdf')
