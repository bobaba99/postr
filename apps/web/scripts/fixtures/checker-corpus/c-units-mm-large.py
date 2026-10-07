import numpy as np
import matplotlib.pyplot as plt

plt.rcParams['font.size'] = 14
fig, ax = plt.subplots(figsize=(250 / 25.4, 180 / 25.4))   # 250 x 180 mm
x = np.linspace(0, 1, 20)
ax.plot(x, np.sin(6 * x), label="trial 1")
ax.plot(x, np.sin(6 * x + 0.4), label="trial 2")
ax.set_title("Wide panel")
ax.set_xlabel("Phase")
ax.set_ylabel("Amplitude")
ax.legend()
fig.tight_layout()
fig.savefig("wide.png", dpi=300)
