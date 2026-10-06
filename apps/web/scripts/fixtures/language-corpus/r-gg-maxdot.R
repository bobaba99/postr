ggplot(weather, aes(month, max.temp)) +
  geom_line() +
  geom_line(aes(y = min.temp), linetype = 2)
