import numpy as np
import matplotlib.pyplot as plt

fig, axs = plt.subplots(1, 3, figsize=(6.4, 4.8))
fig.set_layout_engine('tight')
for i, ax in enumerate(axs):
    ax.plot(np.arange(5), np.arange(5) ** 2 * i, label='series')
    ax.set_title(f'Group {i}')
    ax.set_xlabel('Week')
    ax.set_ylabel('Weight (g)')
axs[0].legend()
fig.savefig('three.png', dpi=150)
