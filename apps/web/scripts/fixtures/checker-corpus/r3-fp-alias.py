from types import SimpleNamespace

import numpy as np
import matplotlib.pyplot as plt
from matplotlib.font_manager import FontProperties as FP

SIZES = SimpleNamespace(title=9, label=9)
legend_font = FP(family='sans-serif', size=14)

x = np.linspace(0, 10, 50)
fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.plot(x, np.sin(x), label='sin')
ax.set_title('Wave', fontsize=SIZES.title)
ax.set_xlabel('Phase', fontsize=SIZES.label)
ax.set_ylabel('Value', fontsize=SIZES.label)
ax.legend(prop=legend_font)
fig.savefig('wave.png', dpi=150)
