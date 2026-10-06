library(ggplot2)
df <- data.frame(group = c("A", "B", "C"), value = c(25, 25, 50))
ggplot(df, aes(x = "", y = value, fill = group)) +
  geom_bar(stat = "identity", width = 1) +
  coord_polar("y", start = 0) +
  theme_void(base_size = 11)
ggsave("pie.png", width = 5, height = 5)
