import numpy as np
import matplotlib
import matplotlib.pyplot as plt
fig1, ax1 = plt.subplots(figsize=(6.4, 4.8))
ax1.plot([1, 2, 3, 4], [1, 4, 9, 16], label='L1_a')
ax1.plot([1, 2, 3, 4], [2, 3, 5, 8], label='L1_b')
ax1.set_title('T1_title')
ax1.set_xlabel('X1_label')
ax1.set_ylabel('Y1_label')
ax1.legend()
ax1.tick_params(labelsize=7)
fig1.tight_layout()
fig1.savefig('f02_a.pdf')
plt.close(fig1)
BIG = 26
plt.rcParams.update({'font.size': BIG})  # the slide version: every text bigger
fig2, ax2 = plt.subplots(figsize=(6.4, 4.8))
ax2.plot([1, 2, 3, 4], [1, 4, 9, 16], label='L2_a')
ax2.plot([1, 2, 3, 4], [2, 3, 5, 8], label='L2_b')
ax2.set_title('T2_title')
ax2.set_xlabel('X2_label')
ax2.set_ylabel('Y2_label')
ax2.legend()
fig2.tight_layout()
fig2.savefig('f02_b.pdf')
