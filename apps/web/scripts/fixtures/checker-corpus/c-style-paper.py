import numpy as np
import matplotlib.pyplot as plt

plt.style.use("seaborn-v0_8-paper")
x = np.linspace(0, 10, 50)
fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.plot(x, np.sin(x), label="sin")
ax.plot(x, np.cos(x), label="cos")
ax.set_title("Style sheet: paper")
ax.set_xlabel("x (rad)")
ax.set_ylabel("amplitude")
ax.legend()
fig.savefig("style_paper.png", dpi=300)
