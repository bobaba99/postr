matplot(t, cbind(a, b), type = "l", lty = 1, xlab = "Time", ylab = "Level")
legend("topright", legend = c("Sample A", "Sample B"), lty = 1, col = 1:2)
