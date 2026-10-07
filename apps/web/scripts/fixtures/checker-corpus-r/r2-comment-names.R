library(ggplot2)
base_fs <- 22  # base font size for the poster
tick_fs <- 8   # tick labels
p <- ggplot(mtcars, aes(wt, mpg, colour = factor(cyl))) +
  geom_point() +
  labs(title = "Fuel use", x = "Weight", y = "MPG", colour = "Cyl") +
  theme_bw(base_size = base_fs) +
  theme(axis.text = element_text(size = tick_fs))
ggsave("fig.png", p, width = 7, height = 5)
