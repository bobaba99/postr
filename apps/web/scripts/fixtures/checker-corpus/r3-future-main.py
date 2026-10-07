from __future__ import annotations

from types import SimpleNamespace

SIZES = SimpleNamespace(title=9, label=9)


def main() -> None:
    import numpy as np
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    x = np.linspace(0, 10, 50)
    fig, ax = plt.subplots(figsize=(6.4, 4.8))
    ax.plot(x, np.exp(-x / 4) * np.cos(x))
    ax.set_title('Damped response', fontsize=SIZES.title)
    ax.set_xlabel('Time (s)', fontsize=SIZES.label)
    ax.set_ylabel('Amplitude', fontsize=SIZES.label)
    fig.savefig('damped.png', dpi=150)


if __name__ == '__main__':
    main()
