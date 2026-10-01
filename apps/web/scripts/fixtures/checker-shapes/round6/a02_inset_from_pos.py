# round 6, the code reviewer's a02 (R6C-03): a zoom inset placed by hand from a panel's corner after tight_layout.
import numpy as np
import matplotlib.pyplot as plt
fig, ax = plt.subplots(figsize=(6.4, 4.8))
x = np.linspace(0, 10, 50)
ax.plot(x, np.sin(x))
ax.set_title("Signal", fontsize=8)
ax.set_xlabel("time (s)", fontsize=8)
ax.set_ylabel("amplitude", fontsize=8)
ax.tick_params(labelsize=7)
fig.tight_layout()
# a zoom panel placed by hand in the panel's top-right corner
p = ax.get_position()
ins = fig.add_axes([p.x1 - 0.3 * p.width, p.y1 - 0.3 * p.height, 0.28 * p.width, 0.28 * p.height])
ins.plot(x[:10], np.sin(x[:10]))
ins.set_xticks([]); ins.set_yticks([])
fig.savefig("a02.png")
