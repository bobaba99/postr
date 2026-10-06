fig = px.line(df, x="time", y="score", title="Trend")
fig.update_layout(font_size=12)
fig.show()
