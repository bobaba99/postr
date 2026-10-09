import numpy as np
import matplotlib.pyplot as plt

x = np.linspace(0, 10, 50)
fig, axs = plt.subplots(1, 2, figsize=(10, 4))
axs[0].plot(x, np.sin(x))
axs[1].plot(x, np.cos(x))
axs[0].set_xlabel('Time (s)', fontsize=20)
axs[1].set_xlabel('Time (s)', fontsize=20)
axs[1].tick_params(labelsize=11)
fig.tight_layout()
fig.savefig('fig.png', dpi=300)
