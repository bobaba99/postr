library(ggplot2)
theme_set(theme_classic(base_size = 20))   # lab-wide poster default

df <- data.frame(dose = rep(c(0, 1, 2, 4), 6), arm = rep(c("placebo", "drug"), each = 12),
                 resp = c(1, 2, 2.5, 3, 1.2, 2.1, 2.4, 3.2, 0.9, 1.8, 2.6, 3.1, 1, 3, 5, 8, 1.1, 3.2, 5.1, 7.9, 0.8, 2.9, 4.8, 8.2))
p <- ggplot(df, aes(dose, resp, colour = arm)) +
  geom_point() + geom_line(stat = "summary", fun = mean) +
  labs(title = "Dose response", x = "Dose (mg/kg)", y = "Response", colour = "Arm") +
  theme_bw()
ggsave("dose.png", p, width = 7, height = 5)
