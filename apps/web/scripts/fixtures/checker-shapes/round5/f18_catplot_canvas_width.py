import numpy as np
import matplotlib
import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd
df = pd.DataFrame({'X1_cat': np.tile(['k_a', 'k_b', 'k_c'], 8), 'Y1_val': np.arange(24) % 7, 'LT_grp': np.repeat(['L1_first_group', 'L1_second_group'], 12)})
g = sns.catplot(data=df, x='X1_cat', y='Y1_val', hue='LT_grp', kind='bar', height=3, aspect=1.5)
g.savefig('f18.pdf')
