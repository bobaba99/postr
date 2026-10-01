import matplotlib.pyplot as plt

fig1, ax1 = plt.subplots(figsize=(6.4, 4.8))
ax1.plot([1, 2, 3], [2, 3, 1], label="a")
ax1.set_title("First")
ax1.set_xlabel("time (s)")
ax1.set_ylabel("value")
ax1.legend()

fig2, ax2 = plt.subplots(figsize=(6.4, 4.8))
ax2.bar(["x", "y"], [3, 4], label="b")
ax2.set_title("Second")
ax2.set_xlabel("group")
ax2.set_ylabel("count")
ax2.legend()

fig1.savefig("first.png", dpi=100)
fig2.savefig("second.png", dpi=100)
