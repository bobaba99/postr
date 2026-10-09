import numpy as np
import matplotlib.pyplot as plt

plt.rcParams['font.size'] = 18
LABEL_SIZE = 8
TITLE_SIZE = 9

x = np.linspace(0, 10, 50)
fig, ax = plt.subplots(figsize=(8, 6))
ax.plot(x, np.sin(x), label='sin')
ax.plot(x, np.cos(x), label='cos')
ax.set_xlabel('Phase (rad)', fontsize=LABEL_SIZE)
ax.set_ylabel('Amplitude', fontsize=LABEL_SIZE)
ax.set_title('Two waves', fontsize=TITLE_SIZE)
ax.legend()
fig.savefig('wave.png', dpi=300)
