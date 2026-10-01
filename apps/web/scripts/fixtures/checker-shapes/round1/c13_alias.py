import matplotlib.pyplot as mpl_plt

fig, ax = mpl_plt.subplots(figsize=(6.4, 4.8))
ax.plot([1, 2, 3], [1, 2, 1], label="g")
ax.set_xlabel("x")
ax.set_ylabel("y")
ax.set_title("Alias")
ax.legend()
mpl_plt.savefig("alias.png")
