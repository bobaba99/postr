import numpy as np
import matplotlib.pyplot as plt

z = np.random.default_rng(8).normal(size=(20, 20)).cumsum(axis=0)
fig, ax = plt.subplots(figsize=(6.4, 4.8))
im = ax.imshow(z, cmap="viridis")
ax.set_title("Field", fontsize=20)
ax.set_xlabel("x (um)", fontsize=18)
ax.set_ylabel("y (um)", fontsize=18)
ax.tick_params(labelsize=16)
cb = fig.colorbar(im, ax=ax)
cb.set_label("Intensity (a.u.)")
fig.savefig("field.png", dpi=300)
