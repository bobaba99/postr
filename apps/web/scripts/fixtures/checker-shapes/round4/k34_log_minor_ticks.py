import numpy as np
import matplotlib.pyplot as plt

fig, ax = plt.subplots(figsize=(6.4, 4.8))
x = np.linspace(1.5, 9, 30)
ax.semilogx(x, np.log(x), label='log')
ax.set_title('Narrow log range')
ax.set_xlabel('Dose')
ax.set_ylabel('Effect')
ax.legend()
fig.savefig('log.png', dpi=150)
