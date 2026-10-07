library(ggplot2)
p <- ggplot(mtcars, aes(wt, mpg)) + geom_point() +
  labs(title = "With subtitle and caption", subtitle = "Motor Trend 1974", x = "Weight", y = "MPG",
       caption = "Source: Henderson and Velleman (1981)") +
  theme_bw(base_size = 15)
ggsave("cap.png", p, width = 7, height = 5)
