import numpy as np
import matplotlib.pyplot as plt

plt.rcParams.update({'font.size': 22})

x = np.linspace(0, 10, 50)
fig, ax = plt.subplots()
ax.plot(x, np.sin(x), label='sin')
ax.plot(x, np.cos(x), label='cos')
ax.set_xlabel('Phase (rad)')
ax.set_ylabel('Amplitude')
ax.set_title('Two waves', fontsize=12)
ax.tick_params(labelsize=8)
ax.legend()
fig.savefig('wave.png', dpi=300)
