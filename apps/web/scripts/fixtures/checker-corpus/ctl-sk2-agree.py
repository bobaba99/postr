import numpy as np
import matplotlib.pyplot as plt

# The keyword idioms of the SK2 scripts, each set to the size the element
# has anyway under matplotlib's defaults (labels 10, title 12, legend 10).
x = np.linspace(0, 1, 30)
fig, ax = plt.subplots(figsize=(8, 6))
ax.plot(x, x ** 2, label='Quadratic')
ax.plot(x, x, label='Linear')
ax.set_xlabel('Dose (normalised)', size=10)
ax.set_ylabel('Effect', fontdict={'fontsize': 10})
ax.set_title('Dose and effect', size=12)
ax.tick_params(labelsize=10)
ax.legend(prop={'size': 10})
fig.savefig('agree.png', dpi=300)
