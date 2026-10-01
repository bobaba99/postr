import numpy as np
import matplotlib.pyplot as plt

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(6.4, 4.8))
for ax, name in ((ax1, "Main"), (ax2, "Inset")):
    ax.plot(np.arange(6), np.arange(6) ** 2)
    ax.set_title(name, fontsize=8)
    ax.set_xlabel("dose (mg)", fontsize=8)
    ax.tick_params(labelsize=7)
fig.tight_layout()
# The second panel placed by hand after the layout.
ax2.set_position([0.62, 0.55, 0.3, 0.3])
fig.savefig("placed.png", dpi=150)
