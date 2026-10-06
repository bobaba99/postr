import matplotlib.pyplot as plt

plt.rcParams['font.size'] = 10
fig, ax = plt.subplots(figsize=(6, 4))
ax.plot([1, 2, 4, 8], [3.1, 4.8, 6.2, 7.9], marker='o')
ax.set_xlabel('Dose (mg)')
ax.set_ylabel('Response')
fig.savefig('fig2.png', dpi=300)
