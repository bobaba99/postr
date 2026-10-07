library(ggplot2)
p <- ggplot(mtcars, aes(wt, mpg, colour = factor(cyl))) + geom_point() +
  labs(title = "Control", x = "Weight", y = "MPG", colour = "Cyl") +
  theme_classic(base_size = 16) +
  theme(axis.text = element_text(size = 13))
ggsave("ctl.png", p, width = 7, height = 5)
