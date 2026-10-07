import numpy as np
import matplotlib.pyplot as plt

CONFIG = {'font_size': 20, 'figsize': (8, 6), 'dpi': 300}

plt.rcParams['font.size'] = CONFIG['font_size']
rng = np.random.default_rng(15)
fig, ax = plt.subplots(figsize=(8, 6))
ax.plot(rng.normal(size=30).cumsum(), label='Treatment')
ax.plot(rng.normal(size=30).cumsum(), label='Placebo')
ax.set_xlabel('Week')
ax.set_ylabel('Symptom score')
ax.set_title('Trial outcome')
ax.legend()
fig.tight_layout()
fig.savefig('trial.png', dpi=CONFIG['dpi'])
