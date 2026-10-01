import pickle
import matplotlib.pyplot as plt

fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.plot([1, 2, 3], [2, 1, 3], label='series')
ax.set_title('Keep editable')
ax.set_xlabel('x')
ax.set_ylabel('y')
ax.legend()
fig.tight_layout()
fig.savefig('series.png', dpi=150)
with open('series.fig.pickle', 'wb') as fh:
    pickle.dump(fig, fh)
