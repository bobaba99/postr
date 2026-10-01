import numpy as np
import matplotlib.pyplot as plt

fig, axs = plt.subplots(1, 3, figsize=(6.4, 4.8))
for i, ax in enumerate(axs):
    ax.plot(np.arange(6), np.arange(6) * (i + 1), label='v')
    ax.set_title(f'Arm {i + 1}')
    ax.set_xlabel('Visit')
    ax.set_ylabel('Score')
    ax.legend()
fig.tight_layout()
fig.set_size_inches(9, 3)
fig.savefig('arms.png', dpi=150)
