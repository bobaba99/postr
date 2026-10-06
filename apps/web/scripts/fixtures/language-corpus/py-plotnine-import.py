from plotnine import ggplot, aes, geom_point, theme_bw, theme, element_text
p = (
    ggplot(df, aes("dose", "response"))
    + geom_point()
    + theme_bw(base_size=11)
    + theme(axis_text_x=element_text(size=8))
)
p.save("fig.png", width=6, height=4, dpi=300)
