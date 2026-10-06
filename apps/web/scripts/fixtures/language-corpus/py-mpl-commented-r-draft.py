import matplotlib.pyplot as plt
# the R version this replaced:
# library(ggplot2)
# p <- ggplot(d, aes(x, y)) + geom_point() + theme_minimal()
# ggsave("f.png", p, width = 7, height = 5)
plt.rcParams['font.size'] = 10
fig, ax = plt.subplots(figsize=(7, 5))
ax.scatter(x, y)
