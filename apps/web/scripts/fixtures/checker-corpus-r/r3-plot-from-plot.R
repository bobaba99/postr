library(ggplot2)
library(cowplot)

p1 <- ggplot(mtcars, aes(wt, mpg, colour = factor(cyl))) + geom_point(size = 2) +
  labs(title = "Weight", x = "Weight (1000 lb)", y = "MPG", colour = "Cylinders") +
  theme_bw(base_size = 16)
p2 <- p1 + aes(x = hp) + labs(title = "Power", x = "Horsepower")
fig <- plot_grid(p1, p2, ncol = 2)
ggsave("figure.png", fig, width = 10, height = 4)
