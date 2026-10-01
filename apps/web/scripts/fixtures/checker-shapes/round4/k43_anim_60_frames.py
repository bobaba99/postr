import numpy as np
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation, PillowWriter

fig, axs = plt.subplots(2, 2, figsize=(6.4, 4.8))
x = np.linspace(0, 2 * np.pi, 50)
lines = []
for i, ax in enumerate(axs.flat):
    lines.append(ax.plot(x, np.sin(x), label='wave')[0])
    ax.set_xlabel('phase')
    ax.set_ylabel('amplitude')
    ax.set_title(f'channel {i}')
    ax.legend()
fig.tight_layout()


def frame(i):
    for k, ln in enumerate(lines):
        ln.set_ydata(np.sin(x + i / 5 + k))
    return lines


FuncAnimation(fig, frame, frames=60).save('waves.gif', writer=PillowWriter(fps=10))
