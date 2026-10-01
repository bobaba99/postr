import numpy as np
import matplotlib.pyplot as plt

# Every text is far below its minimum at every print size the harness uses
# (6 pt on an 8 x 6 in canvas, at most 1.67 x), so a fix can only raise it.
plt.rcParams['font.size'] = 6

x = np.linspace(0, 1, 30)
fig, ax = plt.subplots(figsize=(8, 6))
ax.plot(x, np.sqrt(x), label='Group A')
ax.plot(x, x, label='Group B')
ax.set_xlabel('Dose (normalised)')
ax.set_ylabel('Effect')
ax.set_title('Dose and effect')
ax.legend()
fig.savefig('small.png', dpi=300)
