import numpy as np
import matplotlib.pyplot as plt

fig, ax = plt.subplots(figsize=(8, 6))
bars = ax.bar(['Control', 'Drug A', 'Drug B'], [4.2, 5.1, 6.3], yerr=0.4, capsize=5, label='Mean')
ax.bar_label(bars, fmt='%.1f', padding=3)
ax.text(2, 7.0, '**', ha='center')
ax.set_xlabel('Condition')
ax.set_ylabel('Response (a.u.)')
ax.set_title('Response by condition')
ax.legend()
fig.text(0.01, 0.01, 'n = 12 per group; made-up data')
fig.savefig('annot.png', dpi=300)
