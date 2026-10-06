import plotly.graph_objects as go
fig = go.Figure(go.Bar(x=groups, y=means))
fig.update_layout(title="Means by group", font=dict(size=14))
fig.write_image("bar.pdf")
