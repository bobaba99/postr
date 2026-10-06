# import the data first
df <- read.csv("results.csv")
plot(df$dose, df$response, xlab = "Dose (mg)", ylab = "Response")
