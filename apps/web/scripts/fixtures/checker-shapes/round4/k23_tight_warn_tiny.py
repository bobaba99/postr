import numpy as np
import matplotlib.pyplot as plt

fig, axs = plt.subplots(3, 3, figsize=(3.2, 2.4))
for i, ax in enumerate(axs.flat):
    ax.plot(np.arange(4), np.arange(4) * i)
    ax.set_title(f'P{i}')
    ax.set_xlabel('x')
    ax.set_ylabel('y')
fig.tight_layout()
fig.savefig('tiny.png', dpi=200)
