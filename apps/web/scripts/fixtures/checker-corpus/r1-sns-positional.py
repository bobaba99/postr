import numpy as np
import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt

sns.set_theme('notebook', 'whitegrid', 'deep', 'sans-serif', 0.8)
rng = np.random.default_rng(1)
df = pd.DataFrame({'x': np.arange(20), 'y': rng.normal(size=20).cumsum(), 'g': ['a', 'b'] * 10})
fig, ax = plt.subplots(figsize=(8, 6))
sns.lineplot(data=df, x='x', y='y', hue='g', ax=ax)
ax.set_title('Trend')
fig.savefig('fig.png', dpi=300)
