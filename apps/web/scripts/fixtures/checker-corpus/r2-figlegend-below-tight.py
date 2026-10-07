import numpy as np
import matplotlib.pyplot as plt

plt.rcParams['font.size'] = 11
rng = np.random.default_rng(5)
fig, axs = plt.subplots(1, 3, figsize=(9, 3), sharey=True)
names = ['Wild type', 'Knock-out', 'Rescue']
for ax, cond in zip(axs, ['Low dose', 'Mid dose', 'High dose']):
    for n in names:
        ax.plot(np.arange(8), rng.normal(0, 1, 8).cumsum(), label=n)
    ax.set_title(cond)
    ax.set_xlabel('Week')
axs[0].set_ylabel('Weight change (g)')
handles, labels = axs[0].get_legend_handles_labels()
fig.legend(handles, labels, loc='lower center', ncol=3, bbox_to_anchor=(0.5, -0.12), frameon=False)
fig.tight_layout()
fig.savefig('doses.png', dpi=300, bbox_inches='tight', pad_inches=0.05)
