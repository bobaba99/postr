import numpy as np
import matplotlib
import matplotlib.pyplot as plt
fig, axs = plt.subplots(1, 2, figsize=(6.4, 3.2), layout='constrained')
axs[0].plot([1, 2, 3, 4], [1, 4, 9, 16], label='L1_a')
axs[0].plot([1, 2, 3, 4], [2, 3, 5, 8], label='L1_b')
axs[0].set_title('T1_title')
axs[0].set_xlabel('X1_label')
axs[0].set_ylabel('Y1_label')
axs[0].legend()
axs[1].plot([1, 2, 3, 4], [1, 4, 9, 16], label='L2_a')
axs[1].plot([1, 2, 3, 4], [2, 3, 5, 8], label='L2_b')
axs[1].set_title('T2_title')
axs[1].set_xlabel('X2_label')
axs[1].set_ylabel('Y2_label')
axs[1].legend()
axs[1].legend(title='LT_panel_two_title', loc='upper left', bbox_to_anchor=(1, 1))
fig.savefig('f32.pdf')
