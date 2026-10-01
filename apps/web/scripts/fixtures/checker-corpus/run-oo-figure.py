import numpy as np
from matplotlib.figure import Figure

x = np.linspace(0, 1, 30)
fig = Figure(figsize=(8, 6))
ax = fig.subplots()
ax.plot(x, x ** 2, label='Quadratic')
ax.plot(x, x, label='Linear')
ax.set_xlabel('Dose (normalised)')
ax.set_ylabel('Effect')
ax.set_title('Dose and effect')
ax.legend()
fig.savefig('oo.png', dpi=300)
