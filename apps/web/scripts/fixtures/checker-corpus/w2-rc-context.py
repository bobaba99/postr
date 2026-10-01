import numpy as np
import matplotlib.pyplot as plt

x = np.linspace(0, 1, 30)
with plt.rc_context({'axes.labelsize': 9, 'axes.titlesize': 10, 'xtick.labelsize': 8, 'ytick.labelsize': 8, 'legend.fontsize': 8}):
    fig, ax = plt.subplots(figsize=(8, 6))
    ax.plot(x, x ** 2, label='Quadratic')
    ax.plot(x, x, label='Linear')
    ax.set_xlabel('Dose (normalised)')
    ax.set_ylabel('Effect')
    ax.set_title('Dose and effect')
    ax.legend()
    fig.savefig('ctx.png', dpi=300)
