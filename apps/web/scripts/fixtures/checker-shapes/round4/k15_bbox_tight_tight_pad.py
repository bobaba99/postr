import numpy as np
import matplotlib.pyplot as plt

fig, axs = plt.subplots(2, 2, figsize=(6.4, 4.8))
for i, ax in enumerate(axs.flat):
    ax.plot(np.arange(10), np.arange(10) ** (1 + i / 4), label=f'k={i}')
    ax.set_title(f'Condition {i + 1}')
    ax.set_xlabel('Time (s)')
    ax.set_ylabel('Amplitude')
    ax.legend()
fig.tight_layout(pad=0.3)
fig.savefig('grid.png', dpi=150, bbox_inches='tight', pad_inches=0.02)
