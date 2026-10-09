import numpy as np
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages

plt.rcParams['font.size'] = 9
rng = np.random.default_rng(13)
with PdfPages('figure_report.pdf') as pdf:
    fig, ax = plt.subplots(figsize=(6, 4))
    ax.plot(rng.normal(size=40).cumsum(), label='Run 1')
    ax.plot(rng.normal(size=40).cumsum(), label='Run 2')
    ax.set_xlabel('Iteration')
    ax.set_ylabel('Loss')
    ax.set_title('Training loss')
    ax.legend(loc='upper left', bbox_to_anchor=(1.02, 1))
    pdf.savefig(fig, bbox_inches='tight')
    plt.close(fig)
