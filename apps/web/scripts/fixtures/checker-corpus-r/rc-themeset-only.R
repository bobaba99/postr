library(ggplot2)
theme_set(theme_bw(base_size = 7))

df <- data.frame(week = rep(1:8, 2), site = rep(c("north", "south"), each = 8), n = c(3, 5, 6, 8, 9, 12, 14, 15, 2, 4, 4, 7, 8, 9, 11, 13))
p <- ggplot(df, aes(week, n, colour = site)) + geom_line() +
  labs(title = "Weekly counts", x = "Week", y = "Count", colour = "Site")
ggsave("weekly.png", p, width = 7, height = 5)
