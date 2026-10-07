library(ggplot2)

cfg <- list(base = 20, width = 7, height = 5)

p <- ggplot(ToothGrowth, aes(factor(dose), len, fill = supp)) +
  geom_boxplot() +
  labs(title = "Tooth growth", x = "Dose (mg/day)", y = "Length", fill = "Supplement") +
  theme_classic(base_size = cfg$base)
ggsave("teeth.png", p, width = cfg$width, height = cfg$height, dpi = 300)
