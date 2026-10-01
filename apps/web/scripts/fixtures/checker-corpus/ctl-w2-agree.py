import numpy as np
import matplotlib.pyplot as plt

# Per-element keys set to the sizes the elements have anyway under
# font.size 20 (title 'large' = 24, labels and legend 'medium' = 20).
plt.rcParams['font.size'] = 20
plt.rcParams.update({
    'axes.titlesize': 24,
    'axes.labelsize': 20,
    'legend.fontsize': 20,
})

x = np.linspace(0, 1, 30)
fig, ax = plt.subplots(figsize=(8, 6))
ax.plot(x, x ** 2, label='Quadratic')
ax.plot(x, x, label='Linear')
ax.set_xlabel('Dose (normalised)')
ax.set_ylabel('Effect')
ax.set_title('Dose and effect')
ax.tick_params(labelsize=20)
ax.legend()
fig.savefig('w2-same.png', dpi=300)
