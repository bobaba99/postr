library(tidyverse)
read_csv("results.csv") %>%
  filter(phase == "post") %>%
  ggplot(aes(condition, accuracy, fill = condition)) +
  geom_col() +
  theme_light(base_size = 11)
