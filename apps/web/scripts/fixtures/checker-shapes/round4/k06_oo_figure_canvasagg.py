from matplotlib.figure import Figure
from matplotlib.backends.backend_agg import FigureCanvasAgg

fig = Figure(figsize=(6.4, 4.8))
FigureCanvasAgg(fig)
ax = fig.add_subplot()
ax.plot([0, 1, 2], [1, 3, 2], label='model')
ax.set_title('Fit')
ax.set_xlabel('x')
ax.set_ylabel('y')
ax.legend()
fig.tight_layout()
fig.savefig('fit.png', dpi=150)
