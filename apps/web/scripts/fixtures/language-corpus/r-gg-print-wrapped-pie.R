print(
  ggplot(df, aes(x = "", y = prop, fill = group)) +
    geom_col(width = 1) +
    coord_polar("y")
)
