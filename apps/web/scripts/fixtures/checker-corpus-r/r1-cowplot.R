library(ggplot2)
library(cowplot)
df <- data.frame(x = 1:10, y = (1:10)^1.5, g = rep(c("Control", "Treated"), 5))
p <- ggplot(df, aes(x, y, colour = g)) +
  geom_point() +
  labs(title = "Response", x = "Dose", y = "Effect", colour = "Group") +
  theme_cowplot()
ggsave("fig.png", p, width = 7, height = 5)
