import numpy as np
import matplotlib.pyplot as plt
from matplotlib.font_manager import FontProperties

fp = FontProperties(family='serif', size=8)
x = np.linspace(0, 10, 50)
fig, ax = plt.subplots(figsize=(8, 6))
ax.plot(x, np.sin(x), label='sin')
ax.plot(x, np.cos(x), label='cos')
ax.set_xlabel('Time (s)', fontsize=20)
ax.set_ylabel('Signal', fontsize=20)
ax.legend(prop=fp)
fig.tight_layout()
fig.savefig('fig.png', dpi=300)
