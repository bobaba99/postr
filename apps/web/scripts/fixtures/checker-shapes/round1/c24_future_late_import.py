from __future__ import annotations
import matplotlib.pyplot as plt

fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.plot([1, 2, 3], [1, 2, 1], label="g")
ax.set_xlabel("x")
ax.set_ylabel("y")
ax.set_title("Future")
ax.legend()
fig.savefig("future.png")

import json
print(json.dumps({"saved": True}))
