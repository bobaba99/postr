import numpy as np
import matplotlib.pyplot as plt
from matplotlib import rcParams

rcParams['font.size'] = 18

rng = np.random.default_rng(2)
fig, ax = plt.subplots(figsize=(8, 6))
ax.scatter(rng.normal(0, 1, 80), rng.normal(0, 1, 80), s=14, label='Cohort 1')
ax.scatter(rng.normal(1, 1, 80), rng.normal(1, 1, 80), s=14, label='Cohort 2')
ax.set_xlabel('Baseline (z)')
ax.set_ylabel('Follow-up (z)')
ax.set_title('Baseline and follow-up')
ax.legend()
fig.savefig('cohorts.png', dpi=300)
