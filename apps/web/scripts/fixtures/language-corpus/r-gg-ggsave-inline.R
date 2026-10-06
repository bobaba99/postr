ggsave("pie.png", ggplot(df, aes(x = "", y = n, fill = g)) +
  geom_col(width = 1) +
  coord_polar("y"), width = 6, height = 6)
