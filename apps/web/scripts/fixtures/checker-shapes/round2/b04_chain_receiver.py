import matplotlib.pyplot as plt

fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.plot([1, 2, 3], [1, 2, 1], label="g")
ax.set_xlabel("x")
ax.set_ylabel("y")
ax.set_title("T")
ax.legend()
class Holder:
    def __init__(self, f):
        self.makers = {"a": lambda scale: f}


h = Holder(fig)
h.makers["a"](2).savefig("a.png")
