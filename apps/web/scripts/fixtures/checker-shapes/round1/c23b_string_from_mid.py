import matplotlib.pyplot as plt

NOTE = """Mean response per dose,
from the 2020 cohort,
n = 40 animals."""

fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.plot([1, 2, 3], [1, 2, 1], label="g")
ax.set_xlabel("x")
ax.set_ylabel("y")
ax.set_title("String")
ax.legend()
fig.text(0.01, 0.01, NOTE, fontsize=8)
fig.savefig("str.png")
