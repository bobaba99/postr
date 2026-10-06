df |>
  ggplot(aes(time, score, colour = group)) +
  geom_line(linewidth = 1) +
  theme_minimal(base_size = 12)
