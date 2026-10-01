import matplotlib.pyplot as plt

figs = []
for i in range(2):
    fig, ax = plt.subplots(figsize=(6.4, 4.8))
    ax.plot([1, 2, 3], [i, 2, 1], label=f"s{i}")
    ax.set_xlabel("x")
    ax.set_ylabel("y")
    ax.set_title(f"Fig {i}")
    ax.legend()
    figs.append(fig)

for k, f in enumerate(figs): f.savefig(f"fig{k}.png")
