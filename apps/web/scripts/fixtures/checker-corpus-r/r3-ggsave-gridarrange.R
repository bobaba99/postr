library(ggplot2)
library(gridExtra)

p1 <- ggplot(mtcars, aes(wt, mpg)) + geom_point() + labs(x = "Weight", y = "MPG") + theme_bw(base_size = 9)
p2 <- ggplot(mtcars, aes(hp, mpg)) + geom_point() + labs(x = "Power", y = "MPG") + theme_bw(base_size = 9)
ggsave("figure.png", grid.arrange(p1, p2, ncol = 2), width = 10, height = 4)
