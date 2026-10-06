library(tidyverse)
scores <- read_csv("scores.csv")
hist(scores$value, main = "Scores", xlab = "Score", cex.lab = 1.2)

