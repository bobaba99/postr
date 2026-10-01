import numpy as np
import matplotlib.pyplot as plt

fig = plt.figure(figsize=(6.4, 4.8))
ax = fig.add_subplot(projection="3d")
t = np.linspace(0, 4 * np.pi, 60)
ax.plot(np.cos(t), np.sin(t), t)
ax.set_xlabel("x", fontsize=8)
ax.set_ylabel("y", fontsize=8)
ax.set_zlabel("depth", fontsize=8)
ax.tick_params(axis="z", labelsize=7)
fig.savefig("helix.png", dpi=150)
