import numpy as np
import matplotlib.pyplot as plt

# Sizes set per element, the way a poster template (or a checker's fix) does.
plt.rcParams.update({
    'axes.titlesize': 28,
    'axes.labelsize': 26,
    'xtick.labelsize': 20,
    'ytick.labelsize': 20,
    'legend.fontsize': 20,
})

rng = np.random.default_rng(8)
days = np.arange(0, 15)
fig, ax = plt.subplots(figsize=(8, 6))
ax.plot(days, 50 + 2 * days + rng.normal(0, 2, days.size), label='Group A')
ax.plot(days, 50 + days + rng.normal(0, 2, days.size), label='Group B')
ax.set_xlabel('Day')
ax.set_ylabel('Weight (g)')
ax.set_title('Growth')
ax.legend()
fig.savefig('growth.png', dpi=300)
