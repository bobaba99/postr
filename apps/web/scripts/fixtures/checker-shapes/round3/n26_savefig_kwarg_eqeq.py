import matplotlib.pyplot as plt

SAVE = True
fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.plot([1, 2, 3], [1, 2, 1], label="control")
ax.set_xlabel("time (s)")
ax.set_ylabel("signal")
ax.set_title("Result")
ax.legend()
options = dict(savefig=SAVE, show=False)
if options["savefig"]:
    fig.savefig("a.png")
