import numpy as np
import matplotlib.pyplot as plt

x = np.linspace(0, 1, 30)
fig, ax = plt.subplots()
ax.plot(x, x ** 2, label='Quadratic')
ax.plot(x, x, label='Linear')
ax.set_xlabel('Dose (normalised)')
ax.set_ylabel('Effect')
ax.set_title('Dose and effect')
ax.legend()
fig.savefig('default.png')
