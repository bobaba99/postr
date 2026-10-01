# round 6, skeptic-page-2's s16: the later script, fixed at 10 x 7.5 in; its need lists axis titles only.
import matplotlib.pyplot as plt
import numpy as np

x = np.linspace(0, 5, 40)
fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.plot(x, np.exp(-x), label='decay')
ax.set_title('Later analysis')
ax.set_xlabel('time (h)')
ax.set_ylabel('fraction left')
ax.legend()
fig.savefig('s16.png', dpi=100)
