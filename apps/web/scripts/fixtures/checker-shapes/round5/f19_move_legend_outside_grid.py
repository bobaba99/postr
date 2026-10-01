import numpy as np
import matplotlib
import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd
df = pd.DataFrame({'X1_x': np.arange(12), 'Y1_y': np.arange(12) % 5, 'LT_hue': np.repeat(['L1_a', 'L1_b', 'L1_c'], 4)})
fig, axs = plt.subplots(1, 2, figsize=(6.4, 3.2))
for ax in axs:
    sns.lineplot(data=df, x='X1_x', y='Y1_y', hue='LT_hue', ax=ax)
    sns.move_legend(ax, 'upper left', bbox_to_anchor=(1, 1))
fig.tight_layout()
fig.savefig('f19.pdf')
