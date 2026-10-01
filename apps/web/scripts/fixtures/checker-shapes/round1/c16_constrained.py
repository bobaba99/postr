import matplotlib.pyplot as plt

fig, axs = plt.subplots(1, 2, figsize=(6.4, 4.8), constrained_layout=True)
for i, ax in enumerate(axs):
    ax.plot([1, 2, 3], [i, 2, 1], label=f"s{i}")
    ax.set_xlabel("x")
    ax.set_ylabel("y")
    ax.set_title(f"Panel {i}")
    ax.legend()
fig.savefig("cl.png")
