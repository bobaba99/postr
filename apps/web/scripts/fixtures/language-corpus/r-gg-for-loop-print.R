for (g in groups) {
  print(ggplot(subset(df, site == g), aes(x = "", y = n, fill = cat)) +
    geom_col(width = 1) +
    coord_polar("y") +
    ggtitle(g))
}
