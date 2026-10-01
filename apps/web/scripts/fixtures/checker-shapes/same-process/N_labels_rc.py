# harness v6: the same, its labels left to rcParams, so a size the first script leaves behind reaches it.
import matplotlib.pyplot as plt
fig, ax = plt.subplots()
ax.set_xlabel("label")
fig.savefig("r.png")
plt.close(fig)
