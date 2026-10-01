import matplotlib.pyplot as plt
from matplotlib.figure import Figure


class PosterFigure(Figure):
    """House figure class: saves through its canvas, stamping a footer."""

    def savefig(self, fname, **kwargs):
        self.text(0.99, 0.01, 'lab draft', ha='right', fontsize=6)
        self.canvas.print_figure(fname, **kwargs)


fig, ax = plt.subplots(figsize=(6.4, 4.8), FigureClass=PosterFigure)
ax.plot([1, 2, 3], [2, 4, 3], label='treated')
ax.set_title('Response over time')
ax.set_xlabel('Day')
ax.set_ylabel('Signal (a.u.)')
ax.legend()
fig.savefig('poster.png', dpi=150)
