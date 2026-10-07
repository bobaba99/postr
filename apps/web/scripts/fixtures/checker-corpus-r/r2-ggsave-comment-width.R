library(ggplot2)

fig_w <- 18   # cm, two-column width
fig_h <- 12   # cm

p <- ggplot(economics, aes(date, unemploy / 1000)) +
  geom_line() +
  labs(title = "US unemployment", x = NULL, y = "Unemployed (millions)") +
  theme_light(base_size = 9)
ggsave("unemployment.pdf", p, width = fig_w, height = fig_h, units = "cm")
