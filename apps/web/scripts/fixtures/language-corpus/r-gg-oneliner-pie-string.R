ggplot(votes, aes(x = "", y = share, fill = party)) + geom_col(width = 1) + coord_polar("y")
