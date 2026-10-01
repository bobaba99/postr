import numpy as np, matplotlib.pyplot as plt

fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.plot([1, 2, 3], [1, 2, 1], label="g")
ax.set_xlabel("x")
ax.set_title("Multi import")
ax.legend()
plt.show()
