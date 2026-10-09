library(ggplot2)
p <- ggplot(mtcars, aes(disp, mpg, colour = factor(cyl))) + geom_point() +
  labs(title = "Saved in mm", x = "Displacement", y = "MPG", colour = "Cylinders") +
  theme_light(base_size = 14)
ggsave("mm.png", p, width = 250, height = 180, units = "mm", dpi = 600)
