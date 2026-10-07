library(ggplot2)
p <- ggplot(mtcars, aes(wt, mpg, colour = factor(cyl))) + geom_point() +
  theme_bw(base_size = 8) +
  labs(title = "Fuel economy", x = "Weight", y = "MPG", colour = "Cylinders",
       caption = "Styled with theme_bw() at base size 8")
ggsave("fuel.png", p, width = 7, height = 5)
