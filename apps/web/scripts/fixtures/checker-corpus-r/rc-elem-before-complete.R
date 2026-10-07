library(ggplot2)
df <- data.frame(x = rep(1:6, 2), y = c(2, 3, 5, 4, 6, 7, 1, 2, 2, 3, 4, 4), grp = rep(c("ctrl", "treated"), each = 6))
p <- ggplot(df, aes(x, y, colour = grp)) + geom_line() +
  labs(title = "Element sizes set, then a complete theme", x = "Day", y = "Score", colour = "Group") +
  theme(axis.text = element_text(size = 20), axis.title = element_text(size = 22),
        plot.title = element_text(size = 26), legend.text = element_text(size = 20)) +
  theme_classic(base_size = 6)
ggsave("days.png", p, width = 7, height = 5)
