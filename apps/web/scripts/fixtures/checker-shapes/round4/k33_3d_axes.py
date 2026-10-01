import numpy as np
import matplotlib.pyplot as plt

fig = plt.figure(figsize=(6.4, 4.8))
ax = fig.add_subplot(projection='3d')
t = np.linspace(0, 6, 50)
ax.plot(np.cos(t), np.sin(t), t, label='helix')
ax.set_title('Trajectory')
ax.set_xlabel('x')
ax.set_ylabel('y')
ax.set_zlabel('z')
ax.legend()
fig.savefig('helix.png', dpi=150)
