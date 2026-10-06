library(tidyverse)
library(plotly)
mtcars %>% plot_ly(x = ~wt, y = ~mpg, type = "scatter", mode = "markers")
