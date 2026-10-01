import matplotlib.pyplot as plt


def saved(path):
    def deco(fn):
        def inner(*a, **k):
            f = fn(*a, **k)
            f.savefig(path)
            return f
        return inner
    return deco


@saved("d.png")
def make():
    fig, ax = plt.subplots(figsize=(6.4, 4.8))
    ax.plot([1, 2, 3], [1, 2, 1], label="g")
    ax.set_xlabel("x")
    ax.set_ylabel("y")
    ax.set_title("Deco")
    ax.legend()
    return fig


make()
