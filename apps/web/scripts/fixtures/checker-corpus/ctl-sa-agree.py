import numpy as np
import matplotlib as mpl
import matplotlib.pyplot as plt

# The rcParams alias sets font.size to the value it already has.
plt.rcParams['font.size'] = 20
mpl.rcParams['font.size'] = 20

x = np.linspace(0, 1, 30)
fig, ax = plt.subplots(figsize=(8, 6))
ax.plot(x, x ** 2, label='Quadratic')
ax.plot(x, x, label='Linear')
ax.set_xlabel('Dose (normalised)')
ax.set_ylabel('Effect')
ax.set_title('Dose and effect')
ax.tick_params(labelsize=20)
ax.legend()
fig.savefig('alias-same.png', dpi=300)
