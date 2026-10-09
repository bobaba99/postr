library(ggplot2)

theme_big <- theme_bw(base_size = 20)
p <- ggplot(mtcars, aes(wt, mpg)) + geom_point() +
  labs(title = "Weight and economy", x = "Weight (1000 lb)", y = "MPG") +
  theme(axis.text = element_text(size = 6)) + theme_big
ggsave("figure.png", p, width = 7, height = 5)
