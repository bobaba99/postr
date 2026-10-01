import matplotlib.pyplot as plt
from matplotlib.figure import Figure


class StampedFigure(Figure):
    def savefig(self, *a, **k):
        self.text(0.99, 0.01, "draft", ha="right", fontsize=6)
        return super().savefig(*a, **k)


fig = plt.figure(FigureClass=StampedFigure, figsize=(6.4, 4.8))
ax = fig.add_subplot()
ax.plot([1, 2, 3], [1, 2, 1], label="control")
ax.set_xlabel("time (s)")
ax.set_ylabel("signal")
ax.set_title("Result")
ax.legend()
fig.savefig("a.png")
