library(ggplot2)
library(gridExtra)

p1 <- ggplot(airquality, aes(Temp, Ozone)) + geom_point(na.rm = TRUE) +
  labs(x = "Temperature (F)", y = "Ozone (ppb)") + theme_minimal(base_size = 9)
p2 <- ggplot(airquality, aes(factor(Month), Ozone)) + geom_boxplot(na.rm = TRUE) +
  labs(x = "Month", y = "Ozone (ppb)") + theme_minimal(base_size = 9)
g <- arrangeGrob(p1, p2, ncol = 2)
ggsave("figure3.png", g, width = 10, height = 4, dpi = 300)
