library(ggplot2)

p <- ggplot(iris, aes(Sepal.Length, Petal.Length, colour = Species)) +
  geom_point(size = 2) +
  labs(title = "Iris morphology", x = "Sepal length (cm)", y = "Petal length (cm)") +
  theme_classic(base_size = 10)

png("figure1.png", width = 8, height = 6, units = "in", res = 300)
p
dev.off()
