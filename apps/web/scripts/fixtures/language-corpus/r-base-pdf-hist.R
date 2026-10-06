pdf("hist.pdf", width = 6, height = 4)
hist(scores, breaks = 20, main = "Scores", xlab = "Score", col = "grey80")
dev.off()
