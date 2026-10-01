import numpy as np
import matplotlib.pyplot as plt

x = np.linspace(0, 1, 30)
plt.figure(figsize=(6.4, 4.8))
plt.plot(x, x ** 2, label='Quadratic')
plt.plot(x, x, label='Linear')
plt.xlabel('Dose (normalised)')
plt.ylabel('Effect')
plt.title('Dose and effect')
plt.legend()
plt.savefig('saved-first.png', dpi=300)
plt.show()
