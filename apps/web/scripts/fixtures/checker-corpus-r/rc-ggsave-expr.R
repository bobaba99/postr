library(ggplot2)
p <- ggplot(mtcars, aes(qsec, mpg, colour = factor(am))) + geom_point() +
  labs(title = "Width given as an expression", x = "Quarter mile (s)", y = "MPG", colour = "AM") +
  theme_bw(base_size = 12)
ggsave("expr.png", p, width = 180 / 25.4, height = 120 / 25.4)
