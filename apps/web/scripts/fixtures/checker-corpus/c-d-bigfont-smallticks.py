import numpy as np
import matplotlib.pyplot as plt

plt.rcParams['font.size'] = 24
x = np.arange(12)
fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.plot(x, np.sqrt(x), marker="o", label="observed")
ax.plot(x, np.sqrt(x) * 0.9, label="model")
ax.set_title("Big text, dense ticks")
ax.set_xlabel("Month")
ax.set_ylabel("Index")
ax.tick_params(labelsize=8)        # many ticks: keep them small
ax.legend()
fig.savefig("dense.png", dpi=300)
