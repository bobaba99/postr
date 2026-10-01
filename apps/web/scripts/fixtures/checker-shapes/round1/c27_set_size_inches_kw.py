import matplotlib.pyplot as plt

fig, ax = plt.subplots(figsize=(4, 3))
ax.plot([1, 2, 3], [1, 2, 1], label="g")
ax.set_xlabel("x")
ax.set_ylabel("y")
ax.set_title("Resized")
ax.legend()
fig.set_size_inches(w=10, h=7.5)
fig.savefig("ssi.png")
