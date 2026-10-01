import matplotlib.pyplot as plt

# The layout engine changed after the script's own tight_layout, with no
# Axes moved yet (constrained layout runs at the draw).
fig, axs = plt.subplots(1, 2, figsize=(6.4, 4.8))
for ax in axs:
    ax.plot([1, 2], [2, 1])
    ax.set_title("Condition", fontsize=8)
    ax.set_xlabel("time (min)", fontsize=8)
fig.tight_layout()
fig.set_layout_engine("constrained")
fig.savefig("engine.png", dpi=150)
