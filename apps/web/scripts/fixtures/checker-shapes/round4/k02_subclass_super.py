import matplotlib.pyplot as plt
from matplotlib.figure import Figure


class StampedFigure(Figure):
    def savefig(self, *args, **kwargs):
        self.text(0.01, 0.01, 'v2', fontsize=6)
        return super().savefig(*args, **kwargs)


fig, ax = plt.subplots(figsize=(6.4, 4.8), FigureClass=StampedFigure)
ax.plot([1, 2, 3], [2, 4, 3], label='treated')
ax.set_title('Response over time')
ax.set_xlabel('Day')
ax.set_ylabel('Signal (a.u.)')
ax.legend()
fig.tight_layout()
fig.savefig('stamped.png', dpi=150)
