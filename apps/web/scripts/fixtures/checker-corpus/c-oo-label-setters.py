import numpy as np
import matplotlib.pyplot as plt

plt.rcParams['font.size'] = 16
x = np.linspace(0, 5, 40)
fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.plot(x, np.exp(-x), label="decay")
ax.plot(x, 1 - np.exp(-x), label="growth")
ax.set(title="Object-oriented sizing", xlabel="Time (h)", ylabel="Fraction")
ax.title.set_fontsize(8)
ax.xaxis.label.set_fontsize(7)
ax.yaxis.label.set_size(7)
ax.legend()
fig.savefig("oo.png", dpi=300)
