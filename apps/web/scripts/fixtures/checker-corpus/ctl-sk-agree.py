import numpy as np
import matplotlib.pyplot as plt

# pyplot keywords set to the sizes the elements have anyway under
# font.size 20 (title 24, labels and legend 20).
plt.rcParams['font.size'] = 20

x = np.linspace(0, 1, 30)
plt.figure(figsize=(8, 6))
plt.plot(x, x ** 2, label='Quadratic')
plt.plot(x, x, label='Linear')
plt.xlabel('Dose (normalised)', fontsize=20)
plt.ylabel('Effect', fontsize=20)
plt.title('Dose and effect', fontsize=24)
plt.tick_params(labelsize=20)
plt.legend(fontsize=20)
plt.savefig('kw-same.png', dpi=300)
