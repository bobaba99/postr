library(ggplot2)

df <- data.frame(
  dose = rep(seq(0, 10, length.out = 12), 2),
  effect = c(seq(1, 6, length.out = 12), seq(1, 9, length.out = 12)),
  group = rep(c("Control", "Treated"), each = 12)
)
p <- ggplot(df, aes(dose, effect, colour = group)) +
  geom_line() +
  labs(title = "Dose and effect", x = "Dose (mg)", y = "Effect (a.u.)", colour = "Group") +
  theme_minimal() +
  theme(text = element_text(size = 28))

ggsave("text.png", p, width = 8, height = 6, dpi = 300)
