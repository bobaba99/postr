# round 6, the code reviewer's a01 (R6C-03): a colorbar Axes placed by hand from ax.get_position() after tight_layout.
import numpy as np
import matplotlib.pyplot as plt
fig, ax = plt.subplots(figsize=(6.4, 4.8))
m = ax.pcolormesh(np.random.default_rng(0).random((10, 10)))
ax.set_title("Heat map", fontsize=8)
ax.set_xlabel("column index", fontsize=8)
ax.set_ylabel("row index", fontsize=8)
ax.tick_params(labelsize=7)
fig.tight_layout(rect=[0, 0, 0.85, 1])
# the colorbar placed by hand beside the panel, aligned with it
p = ax.get_position()
cax = fig.add_axes([p.x1 + 0.02, p.y0, 0.03, p.height])
fig.colorbar(m, cax=cax)
fig.savefig("a01.png")
