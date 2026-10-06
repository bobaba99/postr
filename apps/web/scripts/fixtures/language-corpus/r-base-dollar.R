plot(df$time, df$score, pch = 19, xlab = "Time (min)", ylab = "Score")
lines(lowess(df$time, df$score), col = "red")
