import numpy as np
import matplotlib.pyplot as plt

rng = np.random.default_rng(3)
fig, ax = plt.subplots(figsize=(8, 6))
for g in ['Placebo', 'Drug A']:
    ax.scatter(rng.normal(0, 1, 40), rng.normal(0, 1, 40), s=12, label=g)
ax.set_xlabel('Baseline (z)')
ax.set_ylabel('Follow-up (z)')
ax.set_title('Baseline and follow-up')
ax.legend(title='Treatment arm')
fig.savefig('legtitle.png', dpi=300)
