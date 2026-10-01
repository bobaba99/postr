import matplotlib.pyplot as plt

fig1, axs = plt.subplots(1, 2, figsize=(6.4, 4.8), layout="constrained")
for i, ax in enumerate(axs):
    ax.plot([1, 2, 3], [i, 2, 1], label=f"s{i}")
    ax.set_xlabel("x")
    ax.set_ylabel("y")
    ax.set_title(f"Panel {i}")
    ax.legend()
fig1.colorbar(axs[0].images[0] if axs[0].images else axs[0].scatter([1], [1], c=[1]), ax=axs)
fig1.savefig("constrained.png")

fig2, ax2 = plt.subplots(figsize=(6.4, 4.8))
ax2.plot([1, 2], [2, 1])
ax2.set_xlabel("x")
fig2.tight_layout()
fig2.savefig("tight.png")
