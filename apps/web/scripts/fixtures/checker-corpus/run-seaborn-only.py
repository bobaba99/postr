import numpy as np
import pandas as pd
import seaborn as sns

rng = np.random.default_rng(6)
df = pd.DataFrame({
    'Condition': np.repeat(['Control', 'Drug A', 'Drug B'], 20),
    'Response': np.concatenate([rng.normal(m, 0.5, 20) for m in (4.0, 5.0, 6.0)]),
})
sns.set_theme(style='whitegrid')
ax = sns.barplot(data=df, x='Condition', y='Response', hue='Condition', errorbar='sd')
ax.set_xlabel('Condition')
ax.set_ylabel('Response (a.u.)')
ax.set_title('Response by condition')
ax.figure.savefig('seaborn.png', dpi=300)
