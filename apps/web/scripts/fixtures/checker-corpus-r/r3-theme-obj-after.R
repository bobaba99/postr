library(ggplot2)

theme_ticks <- theme(axis.text = element_text(size = 20))
p <- ggplot(mtcars, aes(wt, mpg, colour = factor(cyl))) + geom_point(size = 2) +
  labs(title = "Weight and economy", x = "Weight (1000 lb)", y = "MPG", colour = "Cylinders") +
  theme_bw(base_size = 9) + theme_ticks
ggsave("figure.png", p, width = 7, height = 5)
