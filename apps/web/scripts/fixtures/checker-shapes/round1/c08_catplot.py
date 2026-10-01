import pandas as pd
import seaborn as sns

df = pd.DataFrame({
    "day": ["Mon", "Tue", "Wed"] * 4,
    "total": [3, 5, 4, 6, 2, 7, 5, 3, 4, 6, 5, 2],
    "sex": ["F", "M"] * 6,
})
g = sns.catplot(data=df, x="day", y="total", hue="sex", kind="bar", height=3, aspect=1.3)
g.set_axis_labels("Day", "Total bill")
g.savefig("cat.png")
