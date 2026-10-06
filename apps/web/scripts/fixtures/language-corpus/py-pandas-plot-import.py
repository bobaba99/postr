import pandas as pd
df = pd.read_csv("results.csv")
df.plot.scatter(x="dose", y="response", title="Dose response")
