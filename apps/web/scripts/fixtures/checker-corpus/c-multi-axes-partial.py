import numpy as np
import matplotlib.pyplot as plt

x = np.linspace(0, 1, 30)
fig, axs = plt.subplots(1, 2, figsize=(10, 4))
axs[0].plot(x, x ** 2, label="fit")
axs[0].plot(x, x ** 2 + 0.05, label="data")
axs[0].set_title("A", fontsize=24)
axs[0].set_xlabel("Concentration (uM)", fontsize=20)
axs[0].set_ylabel("Signal", fontsize=20)
axs[0].tick_params(labelsize=18)
axs[0].legend(fontsize=18)
axs[1].plot(x, np.sqrt(x))
axs[1].set_title("B")
axs[1].set_xlabel("Concentration (uM)")
axs[1].set_ylabel("Signal")
fig.tight_layout()
fig.savefig("panels.png", dpi=300)
