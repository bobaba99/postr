p <- ggplot(counts, aes(x = "All samples", y = n, fill = type)) +
  geom_col() +
  theme_minimal(base_size = 11)
ggsave("bar.png", p, width = 4, height = 5)
