library(ggplot2)
ggplot(scores, aes(x = "", y = score)) +
  geom_boxplot() +
  labs(x = NULL, y = "Score") +
  theme_classic(base_size = 12)
ggsave("box.png", width = 3, height = 5)
