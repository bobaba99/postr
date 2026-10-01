import matplotlib.pyplot as plt

_orig_savefig = plt.savefig


def savefig_png_and_pdf(name, **kw):
    _orig_savefig(name + ".png", **kw)
    _orig_savefig(name + ".pdf", **kw)


plt.savefig = savefig_png_and_pdf

fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.plot([1, 2, 3], [1, 2, 1], label="control")
ax.set_xlabel("time (s)")
ax.set_ylabel("signal")
ax.set_title("Result")
ax.legend()
plt.savefig("figure1")
