import configparser

import numpy as np
import matplotlib.pyplot as plt

cfg = configparser.ConfigParser()
cfg.read_string("[plot]\nfont_size = 9\n")
plt.rc('font', size=cfg.get('plot', 'font_size'))

x = np.linspace(0, 10, 50)
fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.plot(x, np.sin(x), label='signal')
ax.set_title('Response over time')
ax.set_xlabel('Time (s)')
ax.set_ylabel('Amplitude')
ax.legend()
fig.savefig('fig.png', dpi=150)
