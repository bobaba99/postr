import numpy as np
import matplotlib.pyplot as plt

fig, axs = plt.subplots(2, 3, figsize=(6.4, 4.8), layout='tight')
for i, ax in enumerate(axs.flat):
    ax.plot(np.arange(5), np.arange(5) * i, label='line')
    ax.set_title(f'Cell {i}')
    ax.set_xlabel('x value')
    ax.set_ylabel('y value')
axs[0, 0].legend()
plt.savefig('six.png', dpi=150)
