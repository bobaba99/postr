import numpy as np
import matplotlib.pyplot as plt

fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.set_title('Field')
ax.set_xlabel('x (mm)')
ax.set_ylabel('y (mm)')
fig.tight_layout()
# Later the lab's template switches the figure to constrained layout.
fig.set_layout_engine('constrained')
im = ax.imshow(np.arange(100).reshape(10, 10))
cb = fig.colorbar(im)
cb.set_label('Intensity')
fig.savefig('field.png', dpi=150)
