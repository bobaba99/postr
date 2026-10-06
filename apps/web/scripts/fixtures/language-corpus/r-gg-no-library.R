ggplot(df, aes(x = dose, y = response)) +
  geom_point(size = 2) +
  labs(x = "Dose (mg)", y = "Response")
