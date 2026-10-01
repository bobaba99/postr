import numpy as np
import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt

rng = np.random.default_rng(3)
df = pd.DataFrame({'group': np.tile(['ctrl', 'drug'], 30), 'score': rng.normal(size=60),
                   'week': np.repeat(['week 1', 'week 2', 'week 3'], 20)})
g = sns.catplot(data=df, x='group', y='score', col='week', kind='box', height=3, aspect=0.7)
g.set_axis_labels('Arm', 'Score')
g.fig.subplots_adjust(top=0.82)
g.fig.suptitle('Scores by week')
plt.savefig('weeks.png', dpi=150)
