library(ggplot2)

p <- ggplot(mtcars, aes(wt, mpg)) + geom_point() +
  labs(title = "Weight and economy", x = "Weight (1000 lb)", y = "MPG") +
  theme_bw(base_size = 9)
print(p + theme(axis.text = element_text(size = 30)))
ggsave("figure.png", p, width = 7, height = 5)
