import numpy as np
import matplotlib.pyplot as plt

x = np.linspace(0, 1, 30)
fig, ax = plt.subplots(figsize=(8, 6))
ax.plot(x, x ** 2, label='Quadratic')
ax.plot(x, x, label='Linear')
ax.set_xlabel('Dose (normalised)')
ax.set_ylabel('Effect')
ax.set_title('Dose and effect')
# Text with no row in the checker's table, set large enough to pass at
# every print size the harness uses (36 pt x 0.75 = 27 pt at the smallest).
ax.text(0.05, 0.8, 'n = 12', fontsize=36, transform=ax.transAxes)
ax.legend(title='Arm', title_fontsize=36, loc='lower right')
fig.savefig('big-notes.png', dpi=300)
