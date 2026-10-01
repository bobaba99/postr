import numpy as np
import matplotlib
import matplotlib.pyplot as plt
plt.rcParams['axes.titlesize'] = 'xx-large'
fig1, ax1 = plt.subplots(figsize=(6.4, 4.8))
ax1.plot([1, 2, 3, 4], [1, 4, 9, 16], label='L1_a')
ax1.plot([1, 2, 3, 4], [2, 3, 5, 8], label='L1_b')
ax1.set_title('T1_title')
ax1.set_xlabel('X1_label')
ax1.set_ylabel('Y1_label')
ax1.legend()
fig1.savefig('f04_a.pdf')
def poster_style(n):
    plt.rcParams['font.size'] = n
poster_style(20)
fig2, ax2 = plt.subplots(figsize=(6.4, 4.8))
ax2.plot([1, 2, 3, 4], [1, 4, 9, 16], label='L2_a')
ax2.plot([1, 2, 3, 4], [2, 3, 5, 8], label='L2_b')
ax2.set_title('T2_title')
ax2.set_xlabel('X2_label')
ax2.set_ylabel('Y2_label')
ax2.legend()
fig2.savefig('f04_b.pdf')
