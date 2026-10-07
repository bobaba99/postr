library(ggplot2)

p <- ggplot(mpg, aes(displ, hwy, colour = drv)) +
  geom_point() +
  labs(x = "Displacement (L)", y = "Highway mpg", colour = "Drive") +
  guides(colour = guide_legend(theme = theme(legend.text = element_text(size = 7),
                                              legend.title = element_text(size = 8)))) +
  theme_bw(base_size = 18)
ggsave("drive.png", p, width = 7, height = 5, dpi = 300)
