from plotnine import *
p = ggplot(df, aes(x="time", y="score", color="group")) + geom_line() + theme_minimal()
ggsave(p, "trend.png", width=7, height=5)
