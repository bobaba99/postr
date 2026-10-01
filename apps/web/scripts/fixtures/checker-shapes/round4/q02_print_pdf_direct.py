import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import FigureCanvasPdf

fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.plot([1, 2, 3], [2, 1, 3], label='series')
ax.set_title('Vector')
ax.set_xlabel('x')
ax.set_ylabel('y')
ax.legend()
FigureCanvasPdf(fig).print_pdf('vector.pdf')
