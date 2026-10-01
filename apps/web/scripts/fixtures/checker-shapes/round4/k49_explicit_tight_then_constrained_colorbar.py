import numpy as np
import matplotlib.pyplot as plt

fig, ax = plt.subplots(figsize=(6.4, 4.8))
image = ax.imshow(np.arange(64).reshape(8, 8))
ax.set_title("Map", fontsize=8)
ax.set_xlabel("column", fontsize=8)
ax.set_ylabel("row", fontsize=8)
fig.tight_layout()
fig.set_layout_engine("constrained")
fig.colorbar(image, ax=ax)
fig.savefig("map.png", dpi=150)
