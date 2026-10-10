import numpy as np
import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt

rng = np.random.default_rng(3)
df = pd.DataFrame({
    'Dose': np.tile(np.linspace(0, 1, 20), 4),
    'Effect': rng.normal(0, 0.1, 80) + np.tile(np.linspace(0, 1, 20), 4),
    'Site': np.repeat(['Site A', 'Site B'], 40),
    'Group': np.tile(np.repeat(['Control', 'Treated'], 20), 2),
})
g = sns.relplot(data=df, x='Dose', y='Effect', hue='Group', col='Site', kind='line', height=4, aspect=1.2)
g.set_axis_labels('Dose (normalised)', 'Effect')
g.set_titles('{col_name}')
plt.show()
