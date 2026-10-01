import matplotlib.pyplot as plt


class Report:
    def __init__(self):
        self.fig, ax = plt.subplots(figsize=(6.4, 4.8))
        ax.plot([1, 2, 3], [1, 2, 1], label="g")
        ax.set_xlabel("x")
        ax.set_ylabel("y")
        ax.set_title("Method")
        ax.legend()

    def save(self, p):
        self.fig.savefig(p)


Report().save("a.png")
