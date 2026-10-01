import matplotlib.pyplot as plt

fig, axs = plt.subplots(2, 2, figsize=(6.4, 4.8), sharex=True, sharey=True)
for i, ax in enumerate(axs.flat):
    ax.plot([1, 2, 3], [i, 2, 1], label=f"s{i}")
    ax.set_title(f"P{i}")
axs[1, 0].set_xlabel("x")
axs[1, 1].set_xlabel("x")
axs[0, 0].set_ylabel("y")
axs[1, 0].set_ylabel("y")
axs[0, 0].legend()
plt.tight_layout()
plt.savefig("grid.png")
