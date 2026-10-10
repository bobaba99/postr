import numpy as np
import matplotlib.pyplot as plt

plt.rcParams['font.size'] = 16
rng = np.random.default_rng(0)
fig, axes = plt.subplots(2, 3, figsize=(12, 7), sharex=True, sharey=True)
for i, ax in enumerate(axes.flat):
    ax.plot(rng.normal(size=50).cumsum())
    ax.set_title(f'Site {i + 1}')
fig.supxlabel('Time (h)', fontsize=9)
fig.supylabel('Signal (a.u.)', fontsize=9)
fig.suptitle('Signal across sites')
fig.tight_layout()
fig.savefig('sites.png', dpi=300)
