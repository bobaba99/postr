import numpy as np
from matplotlib.figure import Figure
fig = Figure(figsize=(6.4, 4.8))
ax = fig.subplots()
ax.plot([1, 2, 3, 4], [1, 4, 9, 16], label='L1_a')
ax.plot([1, 2, 3, 4], [2, 3, 5, 8], label='L1_b')
ax.set_title('T1_title')
ax.set_xlabel('X1_label')
ax.set_ylabel('Y1_label')
ax.legend()
fig.tight_layout()
fig.savefig('f29.pdf')
