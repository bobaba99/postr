library(ggplot2)
df <- data.frame(x = 1:10, y = (1:10)^1.5, g = rep(c("Control", "Treated"), 5))
p <- ggplot(df, aes(x, y, colour = g)) +
  geom_point() +
  labs(title = "Response", x = "Dose", y = "Effect", colour = "Group") +
  theme(axis.text = element_text(size = 6))
theme_update(axis.text = element_text(size = 30))
ggsave("fig.png", p, width = 7, height = 5)
