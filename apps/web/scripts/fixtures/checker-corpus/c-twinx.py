import numpy as np
import matplotlib.pyplot as plt

t = np.arange(12)
fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.plot(t, 20 + 5 * np.sin(t / 2), color="C0")
ax.set_xlabel("Month", fontsize=18)
ax.set_ylabel("Temperature (C)", fontsize=18)
ax.tick_params(labelsize=16)
ax.set_title("Climate", fontsize=20)
ax2 = ax.twinx()
ax2.bar(t, 50 + 30 * np.cos(t / 2), alpha=0.3, color="C1")
ax2.set_ylabel("Rainfall (mm)")
fig.tight_layout()
fig.savefig("climate.png", dpi=300)
