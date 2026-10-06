library(cowplot)
plot_grid(p_left, p_right, labels = c("A", "B"), ncol = 2)
save_plot("combined.png", last_plot(), base_width = 8, base_height = 4)
