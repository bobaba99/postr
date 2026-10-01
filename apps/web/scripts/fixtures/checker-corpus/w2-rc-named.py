import numpy as np
import matplotlib.pyplot as plt

plt.rcParams.update({
    'font.size': 20,
    'xtick.labelsize': 'x-small',
    'ytick.labelsize': 'x-small',
    'legend.fontsize': 'small',
})

x = np.linspace(0, 4, 60)
fig, ax = plt.subplots(figsize=(8, 6))
ax.plot(x, np.exp(-x), label='Decay')
ax.plot(x, 1 - np.exp(-x), label='Recovery')
ax.set_xlabel('Time (h)')
ax.set_ylabel('Fraction')
ax.set_title('Kinetics')
ax.legend()
fig.savefig('kinetics.png', dpi=300)
