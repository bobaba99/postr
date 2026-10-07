import numpy as np
import matplotlib.pyplot as plt

font = {'family': 'serif', 'size': 8}
x = np.linspace(0, 10, 50)
fig, ax = plt.subplots(figsize=(8, 6))
ax.plot(x, np.sin(x), label='sin')
ax.plot(x, np.cos(x), label='cos')
ax.set_title('Response over time', fontdict=font)
ax.set_xlabel('Time (s)', fontdict=font)
ax.set_ylabel('Signal', fontdict=font)
ax.legend()
fig.tight_layout()
fig.savefig('fig.png', dpi=300)
