import numpy as np
import matplotlib.pyplot as plt

plt.rcParams['font.size'] = 16
x = np.linspace(0, 2, 30)
fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.plot(x, x, label="one")
ax.plot(x, x / 2, label="half")
ax.set_title("Literal sizes", fontsize=20)
ax.set_xlabel("x", fontsize=18)
ax.set_ylabel("y", fontsize=18)
ax.tick_params(labelsize=15)
ax.legend()
fig.savefig("literal.png", dpi=300)
