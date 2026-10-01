import numpy as np
import matplotlib.pyplot as plt

x = np.linspace(2, 8, 20)
fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.plot(x, x ** 2, label="x^2")
ax.set_xscale("log")
ax.set_yscale("log")
ax.set_xlabel("dose (mg)")
ax.set_ylabel("response")
ax.set_title("Log-log")
ax.legend()
fig.savefig("log.png")
