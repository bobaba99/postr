import numpy as np
import matplotlib
import matplotlib.pyplot as plt
import pandas as pd
df = pd.DataFrame({'L1_a': [1, 3, 2, 4], 'L1_b': [2, 2, 3, 1]}, index=pd.Index([1, 2, 3, 4], name='X1_idx'))
axs = df.plot(subplots=True, figsize=(6.4, 4.8), fontsize=7, title='S_pandas')
for p, ax in enumerate(axs, 1):
    ax.set_ylabel(f'Y{p}_val')
plt.tight_layout()
plt.savefig('f16.pdf')
