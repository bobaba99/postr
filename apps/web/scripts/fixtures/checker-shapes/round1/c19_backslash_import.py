import matplotlib.pyplot as plt
from matplotlib.ticker import MultipleLocator, \
    FormatStrFormatter

fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.plot([1, 2, 3], [1, 2, 1], label="g")
ax.xaxis.set_major_locator(MultipleLocator(1))
ax.set_xlabel("x")
ax.set_ylabel("y")
ax.set_title("Backslash import")
ax.legend()
fig.savefig("bs.png")
