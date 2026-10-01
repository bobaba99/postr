import matplotlib.pyplot as plt

fig, axs = plt.subplots(1, 2, figsize=(6.4, 4.8), sharey=True)
for i, ax in enumerate(axs):
    ax.plot([1, 2, 3], [i, 2, 1], label=f"s{i}")
    ax.set_title(f"Panel {i}")
    ax.legend()
fig.supxlabel("time (s)")
fig.supylabel("signal")
fig.suptitle("Overall")
fig.text(0.01, 0.95, "A", fontsize=14, weight="bold")
fig.text(0.51, 0.95, "B", fontsize=14, weight="bold")
fig.savefig("sup.png")
