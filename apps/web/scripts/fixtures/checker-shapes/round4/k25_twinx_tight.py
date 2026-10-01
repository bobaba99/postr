import numpy as np
import matplotlib.pyplot as plt

fig, ax = plt.subplots(figsize=(6.4, 4.8))
t = np.arange(10)
ax.plot(t, t ** 2, 'b-', label='mass')
ax.set_xlabel('Time (h)')
ax.set_ylabel('Mass (g)')
ax2 = ax.twinx()
ax2.plot(t, np.sqrt(t), 'r--', label='rate')
ax2.set_ylabel('Rate (g/h)')
ax.set_title('Growth')
ax.legend(loc='upper left')
ax2.legend(loc='lower right')
fig.tight_layout()
fig.savefig('growth.png', dpi=150)
