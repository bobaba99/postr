import matplotlib.pyplot as plt

fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.plot([1, 2, 3], [1, 2, 3], color="C0")
ax.set_xlabel("time (h)")
ax.set_ylabel("temperature")
ax2 = ax.twinx()
ax2.plot([1, 2, 3], [30, 20, 10], color="C1")
ax2.set_ylabel("pressure")
ax3 = ax.twiny()
ax3.set_xlabel("time (min)")
ax3.set_xlim(60, 180)
ax.set_title("Twins")
fig.savefig("twins.png")
