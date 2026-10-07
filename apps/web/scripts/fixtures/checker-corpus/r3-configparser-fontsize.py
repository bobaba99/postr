import configparser

import numpy as np
import matplotlib.pyplot as plt

cfg = configparser.ConfigParser()
cfg.read_string("""
[plot]
font_size = 9
""")
plt.rcParams['font.size'] = cfg['plot']['font_size']

x = np.linspace(0, 10, 50)
fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.plot(x, np.sin(x), label='signal')
ax.plot(x, np.cos(x), label='reference')
ax.set_title('Response over time')
ax.set_xlabel('Time (s)')
ax.set_ylabel('Amplitude')
ax.legend()
fig.savefig('fig.png', dpi=150)
