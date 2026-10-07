library(ggplot2)
p <- ggplot(mtcars, aes(wt, mpg)) + geom_point() + facet_grid(rows = vars(gear), cols = vars(am)) +
  labs(title = "Grid facets, x strips sized", x = "Weight", y = "MPG") +
  theme_bw(base_size = 11) +
  theme(strip.text.x = element_text(size = 16))
ggsave("grid.png", p, width = 7, height = 6)
