# round 6, skeptic-mpl-3's d01 (R6M-03): saved, then left open; a notebook displays it (or a later cell saves it) once rcParams are given back, and the locator re-spaces the ticks.
import matplotlib.pyplot as plt
fig, ax = plt.subplots(figsize=(6, 4.5))
ax.plot([10000, 90000], [1000, 9000]); ax.set_xlabel('Ax x'); ax.set_ylabel('Ax y'); ax.set_title('Tt disp')
fig.tight_layout()
fig.savefig('s1.svg')
