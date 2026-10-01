import matplotlib.pyplot as plt

fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.plot([1, 2, 3], [1, 2, 1], label="g")
ax.set_xlabel("x", fontsize=30)
ax.set_ylabel("y", fontsize=8)
ax.tick_params(axis="x", labelsize=24)
ax.set_title("Mixed", fontsize=40)
ax.legend(fontsize=6, title="grp", title_fontsize=22)
fig.savefig("mixed.png")
