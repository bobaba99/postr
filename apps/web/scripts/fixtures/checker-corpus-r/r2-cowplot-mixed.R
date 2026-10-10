library(ggplot2)
library(cowplot)
df <- data.frame(x = 1:10, y = (1:10)^1.5, g = rep(c("Control", "Treated"), 5))
p1 <- ggplot(df, aes(x, y)) + geom_point() +
  labs(x = "Dose", y = "Effect") +
  theme_bw(base_size = 9)
p2 <- ggplot(df, aes(g, y)) + geom_boxplot() +
  labs(x = "Group", y = "Effect") +
  theme_bw(base_size = 20)
combined <- plot_grid(p1, p2, ncol = 2)
ggsave("mixed.png", combined, width = 10, height = 4.5, dpi = 300)
