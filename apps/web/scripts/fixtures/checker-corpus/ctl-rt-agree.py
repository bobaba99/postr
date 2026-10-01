import numpy as np
import matplotlib.pyplot as plt

x = np.linspace(0, 1, 30)
fig, ax = plt.subplots(figsize=(8, 6))
# Set after the figure exists, to the values these keys have anyway, so
# when matplotlib reads them cannot change what it draws.
plt.rcParams.update({
    'axes.titlesize': 12,
    'axes.labelsize': 10,
    'legend.fontsize': 10,
})
ax.plot(x, x ** 2, label='Quadratic')
ax.plot(x, x, label='Linear')
ax.set_xlabel('Dose (normalised)')
ax.set_ylabel('Effect')
ax.set_title('Dose and effect')
ax.legend()
fig.savefig('late-same.png', dpi=300)
