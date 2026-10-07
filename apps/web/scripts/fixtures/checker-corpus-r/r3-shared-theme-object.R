library(ggplot2)
library(gridExtra)

theme_fig <- theme_bw(base_size = 16) + theme(legend.position = "bottom")
p1 <- ggplot(mtcars, aes(wt, mpg, colour = factor(cyl))) + geom_point(size = 2) +
  labs(title = "Weight", x = "Weight (1000 lb)", y = "MPG", colour = "Cylinders") + theme_fig
p2 <- ggplot(mtcars, aes(hp, mpg, colour = factor(cyl))) + geom_point(size = 2) +
  labs(title = "Power", x = "Horsepower", y = "MPG", colour = "Cylinders") + theme_fig
g <- arrangeGrob(p1, p2, ncol = 2)
ggsave("figure.png", g, width = 10, height = 4.5)
