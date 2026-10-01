import numpy as np
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle

x = np.linspace(0, 1, 30)
fig, ax = plt.subplots(figsize=(8, 6))
fig.subplots_adjust(left=0.2, right=0.95, bottom=0.2, top=0.85)
ax.plot(x, x ** 2, label='Quadratic')
ax.plot(x, x, label='Linear')
ax.set_xlabel('Dose (normalised)')
ax.set_ylabel('Effect')
ax.set_title('Dose and effect')
ax.legend()
# An invisible frame over the whole canvas: with everything else inside
# it, bbox_inches='tight' (no padding) writes exactly the 8 x 6 in canvas.
fig.add_artist(Rectangle((0, 0), 1, 1, transform=fig.transFigure, fill=False, linewidth=0))
fig.savefig('framed.png', dpi=300, bbox_inches='tight', pad_inches=0)
