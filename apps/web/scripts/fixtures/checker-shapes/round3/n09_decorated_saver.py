import matplotlib.pyplot as plt


def logged(fn):
    def inner(*a, **k):
        print("saving", a)
        return fn(*a, **k)
    return inner


fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.plot([1, 2, 3], [1, 2, 1], label="control")
ax.set_xlabel("time (s)")
ax.set_ylabel("signal")
ax.set_title("Result")
ax.legend()
save = logged(fig.savefig)
save("a.png")
