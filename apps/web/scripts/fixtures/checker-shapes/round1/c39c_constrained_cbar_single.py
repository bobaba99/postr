import numpy as np
import matplotlib.pyplot as plt

fig, ax = plt.subplots(figsize=(6.4, 4.8), constrained_layout=True)
im = ax.imshow(np.arange(16).reshape(4, 4))
fig.colorbar(im, ax=ax, label="value")
ax.set_xlabel("x")
ax.set_ylabel("y")
ax.set_title("One figure")
fig.savefig("one.png")
# plt.tight_layout() was tried and removed
def unused():
    plt.tight_layout()
