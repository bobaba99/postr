import numpy as np
import matplotlib.pyplot as plt

fig, axs = plt.subplots(2, 2, figsize=(6.4, 4.8), layout='constrained')
for i, ax in enumerate(axs.flat):
    ax.plot(np.arange(10), np.sqrt(np.arange(10)) * (i + 1), label='fit')
    ax.set_title(f'Panel {i + 1}')
    ax.set_xlabel('Concentration')
    ax.set_ylabel('Rate')
    ax.legend()
fig.suptitle('Kinetics')
fig.supxlabel('shared x')
fig.savefig('kinetics.png', dpi=150)
