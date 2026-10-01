import matplotlib.pyplot as plt


def make_and_save(name):
    fig, ax = plt.subplots(figsize=(6.4, 4.8))
    ax.plot([1, 2, 3], [1, 3, 2], label="trace")
    ax.set_xlabel("x")
    ax.set_ylabel("y")
    ax.set_title(name)
    ax.legend()
    plt.savefig(name + ".png")
    plt.close(fig)


for n in ("one", "two"):
    make_and_save(n)
