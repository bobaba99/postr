library(ggplot2)
p <- ggplot(mtcars, aes(wt, mpg)) + geom_point() + facet_wrap(~cyl) +
  labs(title = "Facets with default strips", x = "Weight (1000 lb)", y = "Miles per gallon") +
  theme_bw(base_size = 12)
ggsave("facets.png", p, width = 8, height = 4)
