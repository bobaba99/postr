library(ggplot2)

poster <- TRUE
p <- ggplot(mtcars, aes(wt, mpg)) + geom_point() +
  labs(title = "Weight and economy", x = "Weight (1000 lb)", y = "MPG") +
  theme_bw(base_size = 9)
if (poster) {
  p <- p + theme_bw(base_size = 16)
}
ggsave("figure.png", p, width = 7, height = 5)
