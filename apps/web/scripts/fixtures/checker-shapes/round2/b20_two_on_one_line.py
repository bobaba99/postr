import matplotlib.pyplot as plt

fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.plot([1, 2, 3], [1, 2, 1], label="g")
ax.set_xlabel("x")
ax.set_ylabel("y")
ax.set_title("T")
ax.legend()
fig2, ax2 = plt.subplots(figsize=(6.4, 4.8))
ax2.set_xlabel("x2")
fig.savefig("a.png"); fig2.savefig("b.png")
