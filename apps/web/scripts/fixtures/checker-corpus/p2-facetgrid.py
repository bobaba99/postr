import numpy as np
import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt

rng = np.random.default_rng(5)
df = pd.DataFrame({
    'Score': rng.normal(50, 10, 200),
    'Arm': np.repeat(['Arm 1', 'Arm 2'], 100),
})
g = sns.FacetGrid(df, col='Arm', height=3, aspect=1.3)
g.map(plt.hist, 'Score', bins=15)
g.set_axis_labels('Score', 'Count')
g.savefig('facet.png', dpi=300)
