import matplotlib.pyplot

fig, ax = matplotlib.pyplot.subplots(figsize=(6.4, 4.8))
ax.plot([1, 2, 3], [1, 2, 1], label="g")
ax.set_xlabel("x")
ax.set_ylabel("y")
ax.set_title("FQ")
ax.legend()
matplotlib.pyplot.savefig("a.png")
matplotlib.pyplot.show()
