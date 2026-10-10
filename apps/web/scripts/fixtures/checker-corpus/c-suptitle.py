import numpy as np
import matplotlib.pyplot as plt

plt.rcParams['font.size'] = 16
x = np.linspace(0, 3, 30)
fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.plot(x, np.tanh(x), label="model")
ax.plot(x, np.tanh(x) + 0.05, label="observed")
fig.suptitle("Saturation curve", fontsize=9)
ax.set_xlabel("Load")
ax.set_ylabel("Response")
ax.legend()
fig.savefig("sat.png", dpi=300)
