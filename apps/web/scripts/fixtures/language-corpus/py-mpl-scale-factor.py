scale_factor = 1.5
line.set_ydata(y * scale_factor)
axes.autoscale_view()
fig.canvas.draw_idle()
