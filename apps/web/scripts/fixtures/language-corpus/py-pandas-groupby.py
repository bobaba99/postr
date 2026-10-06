df.groupby("group")["value"].mean().plot.bar(rot=0, ylabel="Mean value")
