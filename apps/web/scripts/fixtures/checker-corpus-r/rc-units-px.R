library(ggplot2)
p <- ggplot(mtcars, aes(drat, wt, colour = factor(vs))) + geom_point() +
  labs(title = "Saved in px", x = "Rear axle ratio", y = "Weight", colour = "V/S") +
  theme_minimal(base_size = 12)
ggsave("px.png", p, width = 2400, height = 1800, units = "px", dpi = 300)
