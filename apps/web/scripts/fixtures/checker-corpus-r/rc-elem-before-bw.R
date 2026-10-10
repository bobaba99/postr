library(ggplot2)
df <- data.frame(cond = rep(c("rest", "task"), each = 15), rt = c(480 + (1:15) * 3, 560 + (1:15) * 4))
p <- ggplot(df, aes(cond, rt, fill = cond)) + geom_violin() +
  theme(axis.title = element_text(size = 22), plot.title = element_text(size = 26),
        axis.text = element_text(size = 18), legend.text = element_text(size = 18)) +
  labs(title = "Reaction time", x = "Condition", y = "RT (ms)", fill = "Condition") +
  theme_bw()
ggsave("rt.png", p, width = 7, height = 5)
