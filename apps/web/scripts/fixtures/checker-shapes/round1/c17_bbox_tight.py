import matplotlib.pyplot as plt

fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.plot([1, 2, 3], [1, 2, 1], label="g")
ax.set_xlabel("x label that is fairly long")
ax.set_ylabel("y")
ax.set_title("Tight")
ax.legend()
fig.tight_layout()
fig.savefig("tight.png", bbox_inches="tight", dpi=150)
