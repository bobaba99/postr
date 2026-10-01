import numpy as np
import matplotlib.pyplot as plt


def main():
    fig, axs = plt.subplots(1, 2, figsize=(6.4, 4.8))
    for i, ax in enumerate(axs):
        ax.plot(np.arange(5), np.arange(5) * (i + 1), label='v')
        ax.set_title(f'View {i}')
        ax.set_xlabel('x')
        ax.set_ylabel('y')
        ax.legend()
    fig.tight_layout(w_pad=0.1)
    plt.show()


if __name__ == '__main__':
    main()
