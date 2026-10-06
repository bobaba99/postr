library(ggplot2)
ggplot(df, aes(dose, response)) + geom_point() +
  geom_hline(aes(linetype = "Threshold", yintercept = 0.5)) +
  theme_classic(base_size = 12)
