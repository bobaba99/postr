png("figure2.png", width = 7, height = 5, units = "in", res = 300)
plot(dose, response, pch = 19, xlab = "Dose (mg)", ylab = "Response")
abline(lm(response ~ dose), lty = 2)
dev.off()
