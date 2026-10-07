import numpy as np
import matplotlib.pyplot as plt

cm = 1 / 2.54  # journal single column: 8.5 cm wide
plt.rcParams['font.size'] = 7
fig, ax = plt.subplots(figsize=(8.5 * cm, 6 * cm))
x = np.linspace(0, 1, 20)
ax.plot(x, x ** 1.5, label="model")
ax.plot(x, x ** 1.5 + 0.03, "o", ms=2, label="data")
ax.set_title("Single column")
ax.set_xlabel("x")
ax.set_ylabel("y")
ax.legend()
fig.tight_layout()
fig.savefig("single_col.pdf")
