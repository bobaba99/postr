library(ggplot2)

p <- ggplot(mpg, aes(displ, hwy)) +
  geom_point(alpha = 0.6) +
  labs(title = "Engine size and efficiency", x = "Displacement (L)", y = "Highway mpg") +
  theme_bw(base_size = 12) %+replace%
  theme(plot.title = element_text(face = "bold", hjust = 0))
ggsave("mpg.png", p, width = 7, height = 5, dpi = 300)
