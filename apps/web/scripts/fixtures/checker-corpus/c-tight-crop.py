import numpy as np
import matplotlib.pyplot as plt

plt.rcParams['font.size'] = 16
fig, ax = plt.subplots(figsize=(8, 6))
fig.subplots_adjust(left=0.25, right=0.75, bottom=0.25, top=0.75)   # lots of margin
x = np.linspace(0, 1, 20)
ax.plot(x, 1 - x, label="falling")
ax.plot(x, x, label="rising")
ax.set_title("Cropped by tight")
ax.set_xlabel("x")
ax.set_ylabel("y")
ax.legend()
fig.savefig("cropped.png", dpi=300, bbox_inches="tight")
