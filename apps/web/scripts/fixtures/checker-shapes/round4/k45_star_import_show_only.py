from matplotlib.pyplot import *

fig, ax = subplots(figsize=(6.4, 4.8))
ax.plot([1, 2, 3], [2, 1, 3], label='series')
ax.set_title('Star import')
ax.set_xlabel('x')
ax.set_ylabel('y')
ax.legend()
show()
