import pandas as pd
from plotnine import ggplot, aes, geom_col, theme, element_text
p = ggplot(df, aes("condition", "accuracy")) + geom_col()
p = p + theme(axis_title=element_text(size=9), axis_text=element_text(size=7))
p.save("bars.pdf", width=5, height=4)
