import numpy as np
import matplotlib.pyplot as plt

rng = np.random.default_rng(7)
fig, (ax_a, ax_b) = plt.subplots(1, 2, figsize=(10, 4))
ax_a.hist(rng.normal(size=300), bins=25, color='0.6')
ax_a.set_title('Baseline distribution', fontsize=9)
ax_a.set_title('A', loc='left', fontweight='bold', fontsize=20)
ax_b.scatter(rng.normal(size=80), rng.normal(size=80), s=12)
ax_b.set_title('Pre vs post', fontsize=9)
ax_b.set_title('B', loc='left', fontweight='bold', fontsize=20)
for ax in (ax_a, ax_b):
    ax.set_xlabel('Value', fontsize=14)
    ax.set_ylabel('Count', fontsize=14)
    ax.tick_params(labelsize=12)
fig.tight_layout()
fig.savefig('panels.png', dpi=300)
