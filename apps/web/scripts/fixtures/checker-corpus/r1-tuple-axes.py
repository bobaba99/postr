import numpy as np
import matplotlib.pyplot as plt

x = np.linspace(0, 10, 50)
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10, 4))
ax1.plot(x, np.sin(x))
ax2.plot(x, np.cos(x))
ax1.set_xlabel('Time (s)', fontsize=20)
ax2.set_xlabel('Time (s)', fontsize=20)
ax1.set_ylabel('Signal', fontsize=20)
ax2.set_ylabel('Signal', fontsize=20)
ax1.tick_params(labelsize=18)
ax2.tick_params(labelsize=18)
fig.tight_layout()
fig.savefig('fig.png', dpi=300)
