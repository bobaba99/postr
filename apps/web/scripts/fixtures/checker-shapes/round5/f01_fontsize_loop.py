import numpy as np
import matplotlib
import matplotlib.pyplot as plt

# one figure per talk/poster size: the second at a bigger base font
for i, base in enumerate([10, 24]):
    plt.rcParams["font.size"] = base
    fig, ax = plt.subplots(figsize=(6.4, 4.8))
    ax.plot([1, 2, 3, 4], [1, 4, 9, 16], label='L1_a')
    ax.plot([1, 2, 3, 4], [2, 3, 5, 8], label='L1_b')
    ax.set_title('T1_title')
    ax.set_xlabel('X1_label')
    ax.set_ylabel('Y1_label')
    ax.legend()
    fig.tight_layout()
    fig.savefig(f"f01_{i}.pdf")
    plt.close(fig)
