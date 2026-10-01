import numpy as np
import matplotlib.pyplot as plt

plt.rc('font', size=20)
plt.rc('axes', labelsize=20, titlesize=22)
plt.rc('xtick', labelsize=16)
plt.rc('ytick', labelsize=16)

x = np.arange(5)
fig, ax = plt.subplots(figsize=(8, 6))
ax.bar(x, [4, 7, 3, 8, 5])
ax.set_xticks(x, ['A', 'B', 'C', 'D', 'E'])
ax.set_xlabel('Condition')
ax.set_ylabel('Count')
ax.set_title('Counts by condition')
fig.savefig('bars.png', dpi=300)
