import plotly.graph_objects as go
from plotly.subplots import make_subplots

fig = make_subplots(rows=1, cols=2, subplot_titles=("A", "B"))
fig.add_trace(go.Scatter(x=x, y=y), row=1, col=1)
fig.add_trace(go.Bar(x=g, y=m), row=1, col=2)
fig.update_layout(font=dict(size=14))
fig.write_image("fig.png")
