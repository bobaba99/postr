library(ggplot2)
library(cowplot)

t1 <- theme_bw(base_size = 16)
t2 <- t1 + theme(legend.position = "bottom")
make <- function(d, xv) ggplot(d, aes(.data[[xv]], mpg)) + geom_point() + labs(title = xv) + t2
p1 <- make(mtcars, "wt")
p2 <- make(mtcars, "hp")
fig <- plot_grid(p1, p2, ncol = 2)
ggsave("figure.png", fig, width = 10, height = 4)
