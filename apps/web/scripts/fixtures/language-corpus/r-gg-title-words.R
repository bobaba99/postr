ggplot(trade, aes(year, value)) +
  geom_col() +
  labs(title = "Import share by product class")
