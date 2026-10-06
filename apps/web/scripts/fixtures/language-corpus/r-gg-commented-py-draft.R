library(ggplot2)
# python draft I abandoned:
# import matplotlib.pyplot as plt
# fig, ax = plt.subplots(1, 2, figsize=(12, 8))
# ax.set_xlabel("x"); plt.savefig("f.png")
p <- ggplot(mtcars, aes(wt, mpg)) + geom_point() + theme_minimal(base_size = 11)
ggsave("fig.png", p, width = 7, height = 5)
