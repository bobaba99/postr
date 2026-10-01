import matplotlib.pyplot as plt
from matplotlib.figure import Figure


class Fig2(Figure):
    def export(self, name):
        Figure.savefig(self, name, dpi=120)


fig = plt.figure(figsize=(6.4, 4.8), FigureClass=Fig2)
ax = fig.add_subplot()
ax.bar(['a', 'b', 'c'], [3, 5, 2], label='count')
ax.set_title('Counts')
ax.set_xlabel('Group')
ax.set_ylabel('N')
ax.legend()
fig.export('counts.png')
