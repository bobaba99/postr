import numpy as np
import matplotlib.pyplot as plt

x = np.linspace(0, 1, 30)
fig, ax = plt.subplots()
for k in range(4):
    ax.plot(x, x ** (k + 1), label=f'Condition number {k + 1}')
ax.set_xlabel('Dose (normalised)')
ax.set_ylabel('Effect')
ax.set_title('Dose and effect')
fig.legend(loc='center left', bbox_to_anchor=(1.0, 0.5))
fig.savefig('figlegend.png', dpi=300, bbox_inches='tight')
