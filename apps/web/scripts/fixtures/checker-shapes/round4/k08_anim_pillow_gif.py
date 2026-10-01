import numpy as np
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation, PillowWriter

fig, ax = plt.subplots(figsize=(6.4, 4.8))
x = np.linspace(0, 2 * np.pi, 50)
line, = ax.plot(x, np.sin(x), label='wave')
ax.set_xlabel('phase')
ax.set_ylabel('amplitude')
ax.legend()
fig.tight_layout()


def frame(i):
    line.set_ydata(np.sin(x + i / 2))
    ax.set_title(f'step {i}')
    return line,


anim = FuncAnimation(fig, frame, frames=4)
anim.save('wave.gif', writer=PillowWriter(fps=2))
