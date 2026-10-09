import numpy as np
import matplotlib.pyplot as plt

plt.rcParams['font.size'] = 16
x = np.linspace(0, 1, 30)
fig, axs = plt.subplots(2, 1, figsize=(6.4, 4.8), sharex=True)
axs[0].plot(x, x, label="linear")
axs[1].plot(x, x ** 3, label="cubic")
for a in axs:
    a.set_ylabel("y")
    a.legend(loc="upper left")
axs[0].set_title("Two models")
axs[1].set_xlabel("x")
fig.suptitle("Model comparison across the full range of x", y=1.25)
fig.savefig("models.png", dpi=300, bbox_inches="tight")
