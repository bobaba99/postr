ggplot(df, aes(time, score, colour = group)) +
  geom_line() +
  facet_wrap(~ site, ncol = 3) +
  scale_colour_manual(values = c("grey40", "steelblue"))
