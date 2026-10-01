import numpy as np
import matplotlib.pyplot as plt

plt.rcParams['font.size'] = 12

rng = np.random.default_rng(1)
t = np.linspace(0, 60, 40)
fig, ax = plt.subplots(figsize=(8, 6))
ax.plot(t, 2 + 0.05 * t + rng.normal(0, 0.2, t.size), label='Treatment')
ax.plot(t, 2 + rng.normal(0, 0.2, t.size), label='Control')
ax.set_xlabel('Time (min)')
ax.set_ylabel('Response (a.u.)')
ax.set_title('Response over time')
ax.legend()
fig.savefig('figure1.png', dpi=300)
