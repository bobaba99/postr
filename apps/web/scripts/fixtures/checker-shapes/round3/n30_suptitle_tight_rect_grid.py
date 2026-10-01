import matplotlib.pyplot as plt

fig, axs = plt.subplots(2, 2, figsize=(6.4, 4.8))
for i, a in enumerate(axs.flat):
    a.plot([1, 2, 3], [1, 2, i], label="g")
    a.set_xlabel("time (s)")
    a.set_ylabel("signal")
    a.set_title(f"Panel {i}")
fig.suptitle("All conditions")
fig.tight_layout(rect=[0, 0, 1, 0.95])
fig.savefig("grid.png")
