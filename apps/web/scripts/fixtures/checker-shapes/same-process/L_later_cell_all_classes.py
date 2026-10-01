# round 6, skeptic-page-2's l1: a plain later script left unfixed, run between two fixed ones.
import matplotlib.pyplot as plt
import numpy as np

t = np.linspace(0, 10, 50)
fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.plot(t, np.sqrt(t), label='sqrt')
ax.plot(t, np.log1p(t), label='log1p')
ax.set_title('Later cell')
ax.set_xlabel('time (s)')
ax.set_ylabel('signal')
ax.legend(title='curve')
fig.savefig('l1.png', dpi=100)
plt.close(fig)
