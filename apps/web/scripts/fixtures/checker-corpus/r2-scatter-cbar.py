import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

rng = np.random.default_rng(14)
df = pd.DataFrame({'depth': rng.uniform(0, 100, 80), 'temp': rng.normal(12, 3, 80), 'oxygen': rng.uniform(2, 9, 80)})
fig, ax = plt.subplots(figsize=(7, 5))
df.plot.scatter(x='depth', y='temp', c='oxygen', colormap='viridis', ax=ax, s=25)
ax.set_xlabel('Depth (m)', fontsize=16)
ax.set_ylabel('Temperature (°C)', fontsize=16)
ax.tick_params(labelsize=14)
ax.set_title('Profile', fontsize=18)
fig.tight_layout()
fig.savefig('profile.png', dpi=300)
