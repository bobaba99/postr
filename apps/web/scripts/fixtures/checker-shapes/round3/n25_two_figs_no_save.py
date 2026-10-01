import matplotlib.pyplot as plt

fig1, ax1 = plt.subplots(figsize=(6.4, 4.8))
ax1.plot([1, 2, 3], [1, 2, 1], label="control")
ax1.set_xlabel("time (s)")
ax1.set_title("First")
ax1.legend()

fig2, ax2 = plt.subplots(figsize=(6.4, 4.8))
ax2.plot([1, 2, 3], [3, 2, 1], label="treated")
ax2.set_xlabel("dose")
ax2.set_title("Second")
ax2.legend()
