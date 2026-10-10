library(ggplot2)
df <- data.frame(g = c("a", "b", "c"), v = c(3, 5, 4))
p <- ggplot(df, aes(g, v, label = v)) + geom_col() +
  geom_text(size = 10, size.unit = "pt", vjust = -0.3) +
  labs(title = "Labels in points", x = "Group", y = "Value") +
  theme_bw(base_size = 16)
ggsave("labels.png", p, width = 7, height = 5)
