# round 6, the mpl reviewer's g24 (R6M-05): a 3D Axes with explicit small sizes and tight_layout.
import matplotlib.pyplot as plt
fig = plt.figure(figsize=(6, 4.5))
ax = fig.add_subplot(projection='3d')
ax.plot([0, 1, 2], [0, 1, 0], [0, 1, 2], label='Lg path')
ax.set_xlabel('Ax 3dx', fontsize=7); ax.set_ylabel('Ax 3dy', fontsize=7); ax.set_zlabel('Ax 3dz', fontsize=7)
ax.tick_params(labelsize=6); ax.set_title('Tt 3d', fontsize=8); ax.legend(fontsize=6)
fig.tight_layout()
fig.savefig('s1.svg')
