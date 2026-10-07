import numpy as np
import matplotlib.pyplot as plt

plt.rcParams['font.size'] = 14
fig, ax = plt.subplots()
x = np.linspace(0, 1, 20)
ax.plot(x, np.cos(5 * x), label="left")
ax.plot(x, np.cos(5 * x + 1), label="right")
ax.set_title("Resized in cm")
ax.set_xlabel("Position")
ax.set_ylabel("Signal")
ax.legend()
fig.set_size_inches(26 / 2.54, 19 / 2.54)
fig.tight_layout()
fig.savefig("resized.png", dpi=300)
