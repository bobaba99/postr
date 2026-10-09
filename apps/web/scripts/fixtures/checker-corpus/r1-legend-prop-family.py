import numpy as np
import matplotlib.pyplot as plt

x = np.linspace(0, 10, 50)
fig, ax = plt.subplots(figsize=(8, 6))
ax.plot(x, np.sin(x), label='sin')
ax.plot(x, np.cos(x), label='cos')
ax.set_title('Response over time')
ax.set_xlabel('Time (s)')
ax.set_ylabel('Signal')
ax.legend(prop={'family': 'serif'})
fig.tight_layout()
fig.savefig('fig.png', dpi=300)
