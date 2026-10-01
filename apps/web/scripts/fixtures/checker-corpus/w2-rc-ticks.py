import numpy as np
import matplotlib.pyplot as plt

plt.rcParams.update({
    'font.size': 22,
    'xtick.labelsize': 12,
    'ytick.labelsize': 12,
})

x = np.arange(1, 9)
y = np.array([3.1, 3.4, 3.9, 4.2, 4.8, 5.1, 5.7, 6.0])
fig, ax = plt.subplots(figsize=(9, 6))
ax.errorbar(x, y, yerr=0.3, marker='o', capsize=4)
ax.set_xlabel('Session')
ax.set_ylabel('Accuracy (%)')
plt.tight_layout()
plt.savefig('accuracy.png', dpi=300)
