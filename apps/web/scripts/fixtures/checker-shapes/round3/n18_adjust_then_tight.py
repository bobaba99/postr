import matplotlib.pyplot as plt

fig, axs = plt.subplots(2, 2, figsize=(6.4, 4.8))
plt.subplots_adjust(hspace=0.5)
for i, a in enumerate(axs.flat):
    a.plot([1, 2, 3], [1, 2, i])
    a.set_xlabel("time (s)")
    a.set_ylabel("signal")
    a.set_title(f"Panel {i}")
plt.tight_layout()
plt.savefig("panels.png")
