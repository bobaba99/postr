ax = df.plot(x="time", y=["a", "b"], style=["-", "--"])
ax.set_ylabel("Level")
ax.legend(["Sample A", "Sample B"])
