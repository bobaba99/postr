import matplotlib.pyplot as plt
fig, axd = plt.subplot_mosaic([["left", "right"]], figsize=(9, 4), layout="constrained")
axd["left"].plot(time, score)
axd["right"].boxplot([a, b])
fig.savefig("mosaic.png", dpi=200)
