from dataclasses import dataclass
import matplotlib.pyplot as plt


@dataclass
class Options:
    savefig: bool = False
    out: str = "final.png"


opts = Options()
fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.plot([1, 2, 3], [1, 2, 1], label="control")
ax.set_xlabel("time (s)")
ax.set_ylabel("signal")
ax.set_title("Result")
ax.legend()
if opts.savefig:
    fig.savefig(opts.out)
else:
    fig.savefig("draft.png", dpi=50)
