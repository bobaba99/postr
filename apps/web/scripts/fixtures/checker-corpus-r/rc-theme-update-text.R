library(ggplot2)
theme_set(theme_gray(base_size = 16))
theme_update(text = element_text(size = 7))

df <- data.frame(x = 1:20, y = cumsum(c(1, -1, 2, 1, -2, 3, 1, -1, 2, 2, -1, 1, 0, 2, -3, 1, 2, 1, -1, 2)), s = rep(c("A", "B"), 10))
p <- ggplot(df, aes(x, y, colour = s)) + geom_point() +
  labs(title = "theme_update(text =)", x = "Index", y = "Walk", colour = "Series")
ggsave("walk.png", p, width = 7, height = 5)
