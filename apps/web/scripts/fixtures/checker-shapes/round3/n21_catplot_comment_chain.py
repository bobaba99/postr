import pandas as pd
import seaborn as sns

df = pd.DataFrame({"day": ["Mon", "Tue", "Wed"] * 2, "total": [3, 5, 4, 6, 2, 7], "sex": ["F", "M"] * 3})
out = (
    sns.catplot(data=df, x="day", y="total", hue="sex", kind="bar")
    # save it for the poster
    .savefig("cat.png")
)
