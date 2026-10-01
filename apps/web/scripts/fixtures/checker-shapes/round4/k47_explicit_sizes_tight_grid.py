import numpy as np
import matplotlib.pyplot as plt

# Sizes set by the script itself: raised only as the figure is saved.
fig, axs = plt.subplots(2, 2, figsize=(6.4, 4.8))
for i, ax in enumerate(axs.flat):
    ax.plot(np.arange(8), np.arange(8) ** (1 + i / 4))
    ax.set_title(f"Condition {i + 1}", fontsize=8)
    ax.set_xlabel("time (min)", fontsize=8)
    ax.set_ylabel("response", fontsize=8)
    ax.tick_params(labelsize=7)
fig.tight_layout()
fig.savefig("grid.png", dpi=150)
