import numpy as np
import matplotlib.pyplot as plt

plt.rcParams['font.size'] = 16
x = np.linspace(0, 1, 30)
fig, ax = plt.subplots(figsize=(8, 6))
ax.plot(x, x ** 2, label='Quadratic')
ax.plot(x, x, label='Linear')
ax.set_xlabel('Dose (normalised)')
ax.set_ylabel('Effect')
ax.set_title('Dose and effect')
ax.legend(prop={'size': 7})
fig.savefig('prop.png', dpi=300)
