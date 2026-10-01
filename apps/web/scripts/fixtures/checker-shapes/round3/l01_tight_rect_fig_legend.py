import matplotlib.pyplot as plt

fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.plot([1, 2, 3], [1, 2, 1], label="control")
ax.plot([1, 2, 3], [2, 1, 2], label="treatment")
ax.set_xlabel("time (s)")
ax.set_ylabel("signal")
ax.set_title("Legend outside")
fig.legend(loc="center right")
fig.tight_layout(rect=[0, 0, 0.75, 1])
fig.savefig("a.png")
