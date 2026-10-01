import matplotlib.pyplot as plt

plt.rc('figure', figsize=(10, 7.5))
fig, ax = plt.subplots(figsize=(4, 3))
ax.plot([1, 2, 3], [1, 2, 1], label="g")
ax.set_xlabel("x")
ax.set_ylabel("y")
ax.set_title("rc then figsize")
ax.legend()
fig.savefig("rc.png")
