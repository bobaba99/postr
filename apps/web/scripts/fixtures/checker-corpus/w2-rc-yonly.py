import numpy as np
import matplotlib.pyplot as plt

plt.rcParams['font.size'] = 20
plt.rcParams['ytick.labelsize'] = 9

rng = np.random.default_rng(5)
fig, ax = plt.subplots(figsize=(8, 6))
ax.boxplot([rng.normal(m, 1, 40) for m in (3, 4, 6)])
ax.set_xticks([1, 2, 3], ['Site A', 'Site B', 'Site C'])
ax.set_xlabel('Site')
ax.set_ylabel('Yield (t/ha)')
ax.set_title('Yield by site')
fig.savefig('yield.png', dpi=300)
