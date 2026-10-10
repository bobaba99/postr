library(ggplot2)
p <- ggplot(mtcars, aes(hp, qsec, colour = factor(gear))) + geom_point() +
  labs(title = "Saved in cm", x = "Horsepower", y = "Quarter mile (s)", colour = "Gears") +
  theme_classic(base_size = 8)
ggsave("cm.pdf", p, width = 17, height = 12, units = "cm")
