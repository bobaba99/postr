import numpy as np
import matplotlib
import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd
rng = np.random.default_rng(0)
df = pd.DataFrame({'X1_len': rng.normal(size=60), 'Y1_wid': rng.normal(size=60), 'LT_a_rather_long_group_title': np.repeat(['L1_a', 'L1_b', 'L1_c'], 20), 'T_col': np.tile(['p', 'q'], 30)})
g = sns.relplot(data=df, x='X1_len', y='Y1_wid', hue='LT_a_rather_long_group_title', col='T_col', height=3, aspect=1)
g.savefig('f17.pdf')
