import numpy as np
import matplotlib
import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd
rng = np.random.default_rng(1)
df = pd.DataFrame({'a': rng.normal(size=40), 'b': rng.normal(size=40), 'T_col': np.tile(['p', 'q'], 20), 'LT_h': np.repeat(['L1_a', 'L1_b'], 20)})
g = sns.FacetGrid(df, col='T_col', hue='LT_h', height=3)
g.map_dataframe(sns.scatterplot, x='a', y='b')
g.add_legend()
g.set_axis_labels('X1_label', 'Y1_label', fontsize=8)
g.set_titles(size=8)
g.savefig('f20.pdf')
