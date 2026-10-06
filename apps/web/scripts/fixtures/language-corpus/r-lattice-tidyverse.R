library(tidyverse)
library(lattice)
xyplot(mpg ~ wt | factor(cyl), data = mtcars, main = "Fuel use")
