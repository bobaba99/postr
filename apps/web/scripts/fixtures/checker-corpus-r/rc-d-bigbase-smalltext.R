library(ggplot2)
p <- ggplot(mtcars, aes(factor(carb), mpg, fill = factor(am))) + geom_boxplot() +
  labs(title = "Big base, small tick labels", x = "Carburettors", y = "MPG", fill = "AM") +
  theme_bw(base_size = 24) +
  theme(axis.text = element_text(size = 7))
ggsave("carb.png", p, width = 7, height = 5)
