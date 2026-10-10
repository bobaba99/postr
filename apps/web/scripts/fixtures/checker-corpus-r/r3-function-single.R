library(ggplot2)

make_panel <- function(d, xlab) {
  ggplot(d, aes(x, y, colour = g)) + geom_point(size = 2) +
    labs(x = xlab, y = "Response", title = "Panel", colour = "Group") +
    theme_bw(base_size = 16)
}
set.seed(1)
d <- data.frame(x = 1:20, y = rnorm(20), g = rep(c("a", "b"), 10))
p <- make_panel(d, "Dose (mg)")
ggsave("figure.png", p, width = 10, height = 4)
