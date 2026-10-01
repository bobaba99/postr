import matplotlib.pyplot as plt

fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.plot([0, 1, 2], [1, 3, 2], label='model')
ax.set_title('Fit')
ax.set_xlabel('x')
ax.set_ylabel('y')
ax.legend()
fig.canvas.print_png('fit.png')
