# harness v6 (round 6): a negative control for w01, the same eight warnings and a plain 2D panel whose
# layout the fix replays without a warning of its own.
import warnings
import matplotlib.pyplot as plt
for n in range(8):
    warnings.warn(f"A{n} an early note from the script's own setup")
fig, ax = plt.subplots(figsize=(6, 4.5))
ax.plot([0, 1, 2], [0, 1, 0], label='Lg path')
ax.set_xlabel('Ax x', fontsize=7); ax.set_ylabel('Ax y', fontsize=7)
ax.tick_params(labelsize=6); ax.set_title('Tt 2d', fontsize=8); ax.legend(fontsize=6)
fig.tight_layout()
fig.savefig('s1.svg')
