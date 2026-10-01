import numpy as np
import pandas as pd
import seaborn as sns

rng = np.random.default_rng(0)
df = pd.DataFrame({'dose': np.tile([1, 2, 3, 4], 6), 'resp': rng.normal(size=24).cumsum(),
                   'strain': np.repeat(['wild type', 'knockout A', 'knockout B'], 8),
                   'site': np.tile(np.repeat(['north', 'south'], 4), 3)})
g = sns.relplot(data=df, x='dose', y='resp', hue='strain', col='site', kind='line', height=3.2, aspect=1)
g.set_axis_labels('Dose (mg)', 'Response')
g.set_titles('{col_name}')
g.savefig('relplot.png', dpi=150)
