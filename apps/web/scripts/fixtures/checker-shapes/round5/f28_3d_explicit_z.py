import numpy as np
import matplotlib
import matplotlib.pyplot as plt
fig = plt.figure(figsize=(6.4, 4.8))
ax = fig.add_subplot(projection='3d')
ax.plot([0, 1, 2], [0, 1, 0], [0, 2, 1], label='L1_a')
ax.set_title('T1_title')
ax.set_xlabel('X1_label', fontsize=8)
ax.set_ylabel('Y1_label', fontsize=8)
ax.set_zlabel('Z1_label', fontsize=8)
ax.legend()
fig.savefig('f28.pdf')
