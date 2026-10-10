library(ggplot2)
p <- ggplot(mtcars, aes(hp, mpg, colour = factor(gear))) + geom_point() +
  labs(title = "Control rel()", x = "HP", y = "MPG", colour = "Gears") +
  theme_bw(base_size = 18) +
  theme(axis.text = element_text(size = rel(0.9)), legend.text = element_text(size = rel(0.9)))
ggsave("ctlrel.png", p, width = 7, height = 5)
