import numpy as np
import matplotlib.pyplot as plt
from PIL import Image

fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.plot([0, 1, 2], [1, 3, 2], label='model')
ax.set_title('Fit')
ax.set_xlabel('x')
ax.set_ylabel('y')
ax.legend()
fig.canvas.draw()
Image.fromarray(np.asarray(fig.canvas.buffer_rgba())).save('fit.png')
