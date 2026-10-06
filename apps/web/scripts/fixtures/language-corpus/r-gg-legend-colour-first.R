library(ggplot2)
ggplot(df, aes(x = t)) +
  geom_line(aes(colour = "Observed", y = obs)) +
  geom_line(aes(colour = "Fitted", y = fit)) +
  theme_bw(base_size = 11)
