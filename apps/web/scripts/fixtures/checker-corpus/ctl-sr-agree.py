import numpy as np
import matplotlib.pyplot as plt

# plt.rc() sets each size to the value it has anyway under font.size 20.
plt.rcParams['font.size'] = 20
plt.rc('font', size=20)
plt.rc('axes', titlesize=24, labelsize=20)
plt.rc('legend', fontsize=20)

x = np.linspace(0, 1, 30)
fig, ax = plt.subplots(figsize=(8, 6))
ax.plot(x, x ** 2, label='Quadratic')
ax.plot(x, x, label='Linear')
ax.set_xlabel('Dose (normalised)')
ax.set_ylabel('Effect')
ax.set_title('Dose and effect')
ax.tick_params(labelsize=20)
ax.legend()
fig.savefig('rc-same.png', dpi=300)
