import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

rng = np.random.default_rng(2)
df = pd.DataFrame(rng.normal(size=(30, 4)).cumsum(axis=0), columns=['alpha', 'beta', 'gamma', 'delta'])
axes = df.plot(subplots=True, layout=(2, 2), figsize=(6.4, 4.8), title='Four series', legend=True)
for ax in axes.flat:
    ax.set_xlabel('sample')
    ax.set_ylabel('value')
plt.tight_layout()
plt.savefig('series.png', dpi=150)
