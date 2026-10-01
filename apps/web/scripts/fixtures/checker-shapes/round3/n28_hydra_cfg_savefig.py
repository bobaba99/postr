from types import SimpleNamespace
import matplotlib.pyplot as plt

cfg = SimpleNamespace(plot=SimpleNamespace(savefig="", show=False))
fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.plot([1, 2, 3], [1, 2, 1], label="control")
ax.set_xlabel("time (s)")
ax.set_ylabel("signal")
ax.set_title("Result")
ax.legend()
if cfg.plot.savefig:
    fig.savefig(cfg.plot.savefig)
fig.savefig("always.png")
