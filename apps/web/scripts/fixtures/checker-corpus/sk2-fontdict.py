import numpy as np
import matplotlib.pyplot as plt

x = np.linspace(0, 1, 30)
fig, ax = plt.subplots(figsize=(8, 6))
ax.plot(x, x ** 2, label='Quadratic')
ax.plot(x, x, label='Linear')
ax.set_xlabel('Dose (normalised)', fontdict={'fontsize': 9})
ax.set_ylabel('Effect', fontdict={'fontsize': 9})
ax.set_title('Dose and effect', fontdict={'fontsize': 10})
ax.legend()
fig.savefig('fontdict.png', dpi=300)
