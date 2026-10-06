library(ggplot2)
df <- data.frame(dose = c(1, 2, 4, 8), response = c(3.1, 4.8, 6.2, 7.9))
p <- ggplot(df, aes(dose, response)) +
  geom_point() +
  theme_bw(base_size = 11)
ggsave("fig2.png", p, width = 6, height = 4)
