import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages

fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.plot([1, 2, 3], [1, 2, 1], label="control")
ax.set_xlabel("time (s)")
ax.set_ylabel("signal")
ax.set_title("Result")
ax.legend()
with PdfPages("a.pdf") as pdf:
    add_page = pdf.savefig
    add_page(fig)
