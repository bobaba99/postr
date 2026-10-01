import numpy as np
import matplotlib.pyplot as plt

fig = plt.figure(figsize=(6.4, 4.8), layout='constrained')
left, right = fig.subfigures(1, 2)
for sf, name in ((left, 'Cohort A'), (right, 'Cohort B')):
    axs = sf.subplots(2, 1)
    for i, ax in enumerate(axs):
        ax.plot(np.arange(5), np.arange(5) * (i + 1), label=f'arm {i}')
        ax.set_title(f'{name} {i}')
        ax.set_xlabel('Day')
        ax.set_ylabel('Level')
    sf.legend(*axs[0].get_legend_handles_labels(), loc='lower center')
    sf.suptitle(name)
fig.savefig('cohorts.png', dpi=150)
