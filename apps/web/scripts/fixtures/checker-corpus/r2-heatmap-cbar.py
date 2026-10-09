import numpy as np
import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt

sns.set_theme(style='white')
rng = np.random.default_rng(3)
df = pd.DataFrame(rng.normal(size=(40, 6)), columns=['IL6', 'TNF', 'CRP', 'IL10', 'IFNg', 'IL1b'])
corr = df.corr()

fig, ax = plt.subplots(figsize=(7, 6))
sns.heatmap(corr, annot=True, fmt='.2f', cmap='vlag', vmin=-1, vmax=1, square=True,
            cbar_kws={'label': 'Pearson r', 'shrink': 0.8}, ax=ax)
ax.set_title('Cytokine correlations', fontsize=20)
ax.tick_params(labelsize=16)
fig.tight_layout()
fig.savefig('heatmap.png', dpi=300)
