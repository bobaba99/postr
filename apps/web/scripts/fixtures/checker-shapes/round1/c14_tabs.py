import matplotlib.pyplot as plt


def plot():
	fig, ax = plt.subplots(figsize=(6.4, 4.8))
	ax.plot([1, 2, 3], [1, 2, 1], label="g")
	ax.set_xlabel("x")
	ax.set_ylabel("y")
	ax.set_title("Tabs")
	ax.legend()
	if True:
		fig.savefig("tabs.png")


plot()
