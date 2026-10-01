import matplotlib.pyplot as plt

FIGSIZE = (8, 6)
fig, ax = plt.subplots(figsize=FIGSIZE)
ax.plot([1, 2, 3], [1, 2, 1], label="g")
ax.set_xlabel("x")
ax.set_ylabel("y")
ax.set_title("Tuple name")
ax.legend()
fig.savefig("tn.png")
