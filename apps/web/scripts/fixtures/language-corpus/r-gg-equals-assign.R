p = ggplot(df, aes(x = time, y = score)) +
  geom_line() +
  theme_classic(base_size = 10)
ggsave("trend.pdf", p, width = 7, height = 5)
