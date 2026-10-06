par(mfrow = c(1, 2), cex.lab = 1.4, cex.axis = 1.2, cex.main = 1.5)
plot(time, score, type = "l", xlab = "Time (min)", ylab = "Score")
hist(score, main = "Score distribution", xlab = "Score")
