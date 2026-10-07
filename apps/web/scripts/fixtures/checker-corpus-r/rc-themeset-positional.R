library(ggplot2)
theme_set(theme_minimal(9))

df <- data.frame(g = rep(c("a", "b", "c"), each = 10), v = c(1:10, (1:10) * 1.5, (1:10) * 0.7))
p <- ggplot(df, aes(g, v, fill = g)) + geom_boxplot() +
  labs(title = "Positional base size via theme_set", x = "Group", y = "Value", fill = "Group")
ggsave("box.png", p, width = 7, height = 5)
