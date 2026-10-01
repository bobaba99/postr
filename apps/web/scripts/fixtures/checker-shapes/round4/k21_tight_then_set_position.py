import numpy as np
import matplotlib.pyplot as plt

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(6.4, 4.8))
ax1.plot(np.arange(10), label='a')
ax2.plot(np.arange(10)[::-1], label='b')
for ax, t in ((ax1, 'Left'), (ax2, 'Right')):
    ax.set_title(t)
    ax.set_xlabel('x')
    ax.set_ylabel('y')
    ax.legend()
fig.tight_layout()
# Shrink the right panel into a small inset-like square, by hand.
ax2.set_position([0.62, 0.35, 0.3, 0.3])
fig.savefig('manual.png', dpi=150)
