import numpy as np
import matplotlib.pyplot as plt

fig, axs = plt.subplots(1, 2, figsize=(6.4, 4.8))
for i, ax in enumerate(axs):
    ax.set_title(f'Map {i + 1}')
    ax.set_xlabel('Longitude')
    ax.set_ylabel('Latitude')
fig.tight_layout(w_pad=1.0)
im = axs[0].imshow(np.arange(100).reshape(10, 10))
axs[1].imshow(np.arange(100).reshape(10, 10).T)
cb = fig.colorbar(im, ax=axs.ravel().tolist(), shrink=0.8)
cb.set_label('Elevation (m)')
fig.savefig('maps.png', dpi=150)
