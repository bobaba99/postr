import numpy as np
import pandas as pd
import seaborn as sns

rng = np.random.default_rng(4)
df = pd.DataFrame({
    'Condition': np.tile(np.repeat(['Control', 'Drug A', 'Drug B'], 10), 3),
    'Response': rng.normal(5, 1, 90),
    'Week': np.repeat(['Week 1', 'Week 2', 'Week 3'], 30),
})
g = sns.catplot(data=df, x='Condition', y='Response', col='Week', kind='bar', height=3.5, aspect=1.0, errorbar='sd')
g.set_axis_labels('Condition', 'Response (a.u.)')
g.savefig('catplot.png', dpi=300)
