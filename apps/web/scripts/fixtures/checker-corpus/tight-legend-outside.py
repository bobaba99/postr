import numpy as np
import matplotlib.pyplot as plt

plt.rcParams['font.size'] = 16
x = np.linspace(0, 1, 30)
fig, ax = plt.subplots(figsize=(8, 6))
for k in range(4):
    ax.plot(x, x ** (k + 1), label=f'Condition number {k + 1}')
ax.set_xlabel('Dose (normalised)')
ax.set_ylabel('Effect')
ax.set_title('Dose and effect')
ax.legend(bbox_to_anchor=(1.02, 1), loc='upper left')
fig.savefig('outside.png', dpi=300, bbox_inches='tight')
