import sys
import matplotlib.pyplot as plt

fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.plot([1, 2, 3], [1, 2, 1], label="g")
ax.set_xlabel("x")
ax.set_ylabel("y")
ax.set_title("Else")
ax.legend()
if len(sys.argv) > 5:
    print("preview only")
else: fig.savefig("else.png")
