# harness v6: the two-script template of round 4 (R4-08), axis labels set small; fixed with a need given outright.
import matplotlib.pyplot as plt
fig, ax = plt.subplots()
ax.set_xlabel("label", fontsize=8)
fig.savefig("n.png")
plt.close(fig)
