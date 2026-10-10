library(ggplot2)
library(cowplot)

p1 <- ggplot(mtcars, aes(wt, mpg)) + geom_point() +
  labs(x = "Weight (1000 lb)", y = "Miles per gallon") +
  theme_bw(base_size = 9)
p2 <- ggplot(mtcars, aes(factor(cyl), hp)) + geom_boxplot() +
  labs(x = "Cylinders", y = "Horsepower") +
  theme_bw(base_size = 9)
combined <- plot_grid(p1, p2, labels = c("A", "B"), label_size = 14, ncol = 2)
ggsave("figure2.png", combined, width = 10, height = 4.5, dpi = 300)
