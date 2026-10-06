fig = make_subplots(rows=2, cols=1)
fig.add_trace(go.Scatter(x=t, y=v), row=1, col=1)
fig.show()
