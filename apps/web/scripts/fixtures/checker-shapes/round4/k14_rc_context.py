import matplotlib as mpl
import matplotlib.pyplot as plt

with mpl.rc_context({'font.size': 7, 'axes.titlesize': 8, 'axes.labelsize': 7}):
    fig, ax = plt.subplots(figsize=(6.4, 4.8))
    ax.plot([1, 2, 3], [2, 1, 3], label='series')
    ax.set_title('Compact')
    ax.set_xlabel('x')
    ax.set_ylabel('y')
    ax.legend()
    fig.savefig('compact.png', dpi=150)
