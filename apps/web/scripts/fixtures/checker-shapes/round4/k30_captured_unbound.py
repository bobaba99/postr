from matplotlib.figure import Figure
import matplotlib.pyplot as plt

write = Figure.savefig

fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.plot([1, 2, 3], [2, 1, 3], label='series')
ax.set_title('Captured')
ax.set_xlabel('x')
ax.set_ylabel('y')
ax.legend()
write(fig, 'captured.png', dpi=120)
