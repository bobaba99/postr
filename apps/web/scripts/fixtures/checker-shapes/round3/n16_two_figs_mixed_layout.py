import matplotlib.pyplot as plt

fig1, axs = plt.subplots(2, 2, figsize=(6.4, 4.8))
for i, a in enumerate(axs.flat):
    a.plot([1, 2, 3], [1, 2, i])
    a.set_xlabel("time (s)")
    a.set_ylabel("signal")
    a.set_title(f"Panel {i}")
fig1.tight_layout()
fig1.savefig("panels.png")

fig2, ax2 = plt.subplots(figsize=(6.4, 4.8))
ax2.plot([1, 2, 3], [3, 2, 1])
ax2.set_xlabel("dose")
fig2.subplots_adjust(left=0.2)
fig2.savefig("single.png")
