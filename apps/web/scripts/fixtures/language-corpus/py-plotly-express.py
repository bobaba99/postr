import plotly.express as px
fig = px.scatter(df, x="dose", y="response", color="group", title="Dose response")
fig.update_layout(font=dict(size=12))
fig.write_image("scatter.png", width=800, height=600, scale=2)
