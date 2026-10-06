ggplot(df, aes(x, y)) +
  geom_point(aes(colour = "Observed")) +
  geom_line(aes(y = pred, colour = "Predicted")) +
  theme_bw(base_size = 11)
