print(ggplot(df, aes(x = t)) +
  geom_point(aes(colour = "Observed", y = obs)) +
  geom_line(aes(colour = "Model", y = fit)))
