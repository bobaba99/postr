import numpy as np
import seaborn as sns
import matplotlib.pyplot as plt

POSTER = False
x = np.linspace(0, 10, 50)
fig, ax = plt.subplots(figsize=(8, 6))
if POSTER:
    sns.set_theme(context='paper')
else:
    pass
ax.plot(x, np.sin(x))
ax.set_title('Response over time')
fig.savefig('fig.png', dpi=300)
