import json

import numpy as np
import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt

cfg = json.loads('{"scale": 0.8}')
sns.set_theme(context='paper', style='ticks', font_scale=cfg['scale'])

rng = np.random.default_rng(9)
df = pd.DataFrame({'t': np.tile(np.arange(20), 2), 'y': rng.normal(size=40).cumsum(), 'arm': np.repeat(['A', 'B'], 20)})
fig, ax = plt.subplots(figsize=(6.4, 4.8))
sns.lineplot(data=df, x='t', y='y', hue='arm', ax=ax)
ax.set_title('Trajectories')
ax.set_xlabel('Day')
ax.set_ylabel('Score')
fig.savefig('traj.png', dpi=150)
