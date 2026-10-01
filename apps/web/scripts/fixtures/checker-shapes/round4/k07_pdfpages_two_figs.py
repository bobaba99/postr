import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages

with PdfPages('report.pdf') as pdf:
    fig1, ax1 = plt.subplots(figsize=(6.4, 4.8))
    ax1.plot([1, 2, 3], [3, 1, 2], label='run 1')
    ax1.set_title('Run 1')
    ax1.set_xlabel('t')
    ax1.set_ylabel('v')
    ax1.legend()
    pdf.savefig(fig1)
    fig2, ax2 = plt.subplots(figsize=(6.4, 4.8))
    ax2.plot([1, 2, 3], [1, 2, 4], label='run 2')
    ax2.set_title('Run 2')
    ax2.set_xlabel('t')
    ax2.set_ylabel('v')
    ax2.legend()
    fig2.tight_layout()
    pdf.savefig()
