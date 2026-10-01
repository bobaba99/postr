import numpy as np
import matplotlib.pyplot as plt

plt.rc('font', size=18)

x = np.arange(6)
fig, ax = plt.subplots(figsize=(8, 6))
ax.bar(x - 0.2, [3, 5, 4, 6, 7, 5], width=0.4, label='Before')
ax.bar(x + 0.2, [4, 6, 6, 7, 9, 6], width=0.4, label='After')
ax.set_xlabel('Week')
ax.set_ylabel('Sessions')
ax.set_title('Sessions per week')
ax.legend()
fig.savefig('sessions.png', dpi=300)
