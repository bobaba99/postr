from matplotlib.figure import Figure
fig = Figure(figsize=(5, 4))
ax = fig.subplots()
ax.plot([0, 1, 2], [2, 3, 1])
ax.set_xlabel("Step")
fig.savefig("oo.png")
