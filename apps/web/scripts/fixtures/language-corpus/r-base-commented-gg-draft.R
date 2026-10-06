# ggplot version, kept for later:
# p <- ggplot(df, aes(dose, response)) + geom_point() + theme_bw(base_size = 11)
# ggsave("fig2.png", p, width = 6, height = 4)
plot(df$dose, df$response, pch = 19, xlab = "Dose (mg)", ylab = "Response")
