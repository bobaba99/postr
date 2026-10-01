import numpy as np
import matplotlib.pyplot as plt

fig, ax = plt.subplots(figsize=(6.4, 4.8))
im = ax.imshow(np.arange(100).reshape(10, 10))
cb = fig.colorbar(im, ax=ax)
cb.set_label("intensity (a.u.)")
cb.ax.tick_params(labelsize=7)
ax.set_xlabel("column")
ax.set_ylabel("row")
ax.set_title("Heatmap")
plt.savefig("heat.png", bbox_inches="tight")
