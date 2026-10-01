import numpy as np
import matplotlib.pyplot as plt

fig, ax = plt.subplots(figsize=(6.4, 4.8))
x = np.linspace(0, 10, 100)
ax.plot(x, np.exp(-x) * np.sin(3 * x), label='signal')
ax.set_title('Damped oscillation')
ax.set_xlabel('Time (s)')
ax.set_ylabel('Amplitude')
ax.legend(loc='upper right')
fig.tight_layout(pad=0.4)
inset = fig.add_axes([0.55, 0.2, 0.3, 0.25])
inset.plot(x[:20], np.sin(3 * x[:20]))
inset.set_title('first second', fontsize=8)
fig.savefig('damped.png', dpi=150)
