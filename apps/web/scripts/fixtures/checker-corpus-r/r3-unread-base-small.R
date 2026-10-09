library(ggplot2)

cfg <- list(base = 7, width = 7, height = 5)
p <- ggplot(mtcars, aes(wt, mpg, colour = factor(cyl))) + geom_point(size = 2) +
  labs(title = "Weight and economy", x = "Weight (1000 lb)", y = "MPG", colour = "Cylinders") +
  theme_bw(base_size = cfg$base)
ggsave("figure.png", p, width = 7, height = 5)
