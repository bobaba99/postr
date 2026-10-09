library(ggplot2)
theme_set(theme_gray(base_size = 16))
theme_update(axis.text = element_text(size = 6))

p <- ggplot(mtcars, aes(hp, mpg, colour = factor(am))) + geom_point() +
  labs(title = "Horsepower", x = "HP", y = "MPG", colour = "AM")
ggsave("hp.png", p, width = 7, height = 5)
