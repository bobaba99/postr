import numpy as np
import matplotlib.pyplot as plt

plt.rcParams['font.size'] = 16
x = np.arange(1, 6)
fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.plot(x, [2, 4, 3, 6, 5], marker="o", label="observed")
ax.set_title("Annotated outside")
ax.set_xlabel("Visit")
ax.set_ylabel("Score")
ax.legend(loc="upper left")
for y, txt in [(0.9, "n = 48 participants"), (0.75, "p < 0.01 (mixed model)"), (0.6, "error bars: 95% CI")]:
    ax.text(1.03, y, txt, transform=ax.transAxes, va="top")
fig.savefig("annot.png", dpi=300, bbox_inches="tight")
