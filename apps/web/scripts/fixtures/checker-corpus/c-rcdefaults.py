import numpy as np
import matplotlib.pyplot as plt

plt.rcParams['font.size'] = 22   # poster settings from an earlier figure

# ... reset before this figure so the colours and styles are matplotlib's
plt.rcdefaults()

x = np.arange(6)
fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.bar(x - 0.2, [3, 5, 2, 6, 4, 7], width=0.4, label="before")
ax.bar(x + 0.2, [4, 6, 3, 7, 5, 8], width=0.4, label="after")
ax.set_title("Before and after")
ax.set_xlabel("Subject")
ax.set_ylabel("Score")
ax.legend()
fig.savefig("before_after.png", dpi=300)
