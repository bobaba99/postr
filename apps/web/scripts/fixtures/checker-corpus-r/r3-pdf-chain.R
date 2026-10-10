library(ggplot2)

pdf("figure2.pdf", width = 7, height = 5)
ggplot(mtcars, aes(wt, mpg, colour = factor(cyl))) +
  geom_point(size = 2) +
  labs(title = "Fuel economy", x = "Weight (1000 lb)", y = "Miles per gallon", colour = "Cylinders") +
  theme_bw(base_size = 9)
dev.off()
