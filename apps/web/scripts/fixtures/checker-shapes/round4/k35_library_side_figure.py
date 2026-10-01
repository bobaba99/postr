import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from pandas.plotting import scatter_matrix

rng = np.random.default_rng(4)
df = pd.DataFrame(rng.normal(size=(40, 3)), columns=['a', 'b', 'c'])
fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.plot(df['a'].cumsum(), label='a')
ax.set_title('Main result')
ax.set_xlabel('step')
ax.set_ylabel('value')
ax.legend()
fig.savefig('main.png', dpi=150)
# A diagnostics sheet the lab keeps at its own small, dense size.
axes = scatter_matrix(df, figsize=(3, 3), diagonal='kde')
axes[0, 0].get_figure().savefig('diagnostics.png', dpi=150)
