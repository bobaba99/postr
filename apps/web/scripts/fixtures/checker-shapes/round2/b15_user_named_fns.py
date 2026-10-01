from matplotlib.pyplot import subplots


def savefig(f, name):
    f.savefig(name)


def show():
    print("done")


fig, ax = subplots(figsize=(6.4, 4.8))
ax.plot([1, 2, 3], [1, 2, 1], label="g")
ax.set_xlabel("x")
ax.set_ylabel("y")
ax.set_title("User fns")
ax.legend()
savefig(fig, "a.png")
show()
