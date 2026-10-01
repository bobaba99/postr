import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages

figs = []
for i in range(3):
    fig, ax = plt.subplots(figsize=(6.4, 4.8))
    ax.plot([1, 2, 3], [i, i + 1, i + 2], label=f"run {i}")
    ax.set_xlabel("x")
    ax.set_ylabel("y")
    ax.set_title(f"Run {i}")
    ax.legend()
    figs.append(fig)

with PdfPages("all.pdf") as pdf:
    for fig in figs:
        pdf.savefig(fig)
