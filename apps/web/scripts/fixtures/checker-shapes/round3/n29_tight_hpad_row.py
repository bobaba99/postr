import matplotlib.pyplot as plt

fig, axs = plt.subplots(1, 3, figsize=(6.4, 3.0))
for i, a in enumerate(axs):
    a.plot([1, 2, 3], [100, 2000, 30000 * (i + 1)])
    a.set_xlabel("time (s)")
    a.set_ylabel("count per well")
    a.set_title(f"Condition {i}")
fig.tight_layout(w_pad=0.2)
fig.savefig("row.png")
