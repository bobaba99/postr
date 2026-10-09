import numpy as np
import matplotlib.pyplot as plt

SIZES = {'label': 8, 'title': 'large'}
rng = np.random.default_rng(21)
fig, ax = plt.subplots(figsize=(8, 6))
ax.plot(rng.normal(size=30).cumsum(), label='Treatment')
ax.plot(rng.normal(size=30).cumsum(), label='Placebo')
ax.set_xlabel('Week', fontsize=SIZES['label'])
ax.set_ylabel('Score', fontsize=SIZES['label'])
ax.set_title('Trial outcome', fontsize=SIZES['title'])
ax.legend()
fig.tight_layout()
fig.savefig('trial_kw.png', dpi=300)
