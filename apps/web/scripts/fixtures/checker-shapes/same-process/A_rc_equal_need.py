# round 6, the code reviewer's a07: axes.labelsize set to exactly the need (17, given outright) after a figure.
import matplotlib.pyplot as plt
fig1, ax1 = plt.subplots(figsize=(6.4, 4.8))
ax1.plot([1, 2, 3]); ax1.set_xlabel("x"); ax1.set_title("first")
fig1.savefig("a07_1.png")
plt.rcParams["axes.labelsize"] = 17   # the script's own house size
fig2, ax2 = plt.subplots(figsize=(6.4, 4.8))
ax2.plot([1, 2, 3]); ax2.set_xlabel("x"); ax2.set_title("second")
fig2.savefig("a07_2.png")
