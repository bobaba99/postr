import seaborn as sns
import matplotlib.pyplot as plt
sns.set_theme(style="whitegrid", font_scale=1.2)
ax = sns.boxplot(data=df, x="group", y="value")
plt.savefig("box.png", dpi=300)
