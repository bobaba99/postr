# round 6, skeptic-mpl-3's nc_tick_params: a negative control for the ticks after the end (the tick size is the Axes' own, so no re-spacing).
import matplotlib.pyplot as plt
fig, ax = plt.subplots(figsize=(6, 4.5))
ax.plot([10000, 90000], [1000, 9000]); ax.set_xlabel('Ax x'); ax.set_ylabel('Ax y'); ax.set_title('Tt disp')
ax.tick_params(labelsize=14)
fig.tight_layout()
fig.savefig('s1.svg')
