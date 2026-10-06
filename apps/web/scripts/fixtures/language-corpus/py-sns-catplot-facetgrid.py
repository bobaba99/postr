g = sns.catplot(data=df, x="condition", y="accuracy", col="phase", kind="bar", height=4)
g.set_axis_labels("Condition", "Accuracy")
g.savefig("catplot.png", dpi=300)
