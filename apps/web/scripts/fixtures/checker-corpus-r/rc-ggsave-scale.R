library(ggplot2)
p <- ggplot(mtcars, aes(wt, mpg, colour = factor(cyl))) + geom_point() +
  labs(title = "ggsave scale = 2", x = "Weight", y = "MPG", colour = "Cylinders") +
  theme_bw(base_size = 14)
ggsave("scaled.png", p, width = 6, height = 4, scale = 2)
