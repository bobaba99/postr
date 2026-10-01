# round 6, skeptic-page-2's v5: a figure, THEN title and label sizes set small globally; the script's own values must stay after its end.
import matplotlib.pyplot as plt
import numpy as np

x = np.linspace(0, 1, 30)
fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.plot(x, x)
ax.set_title('Before')
ax.set_xlabel('x')
fig.savefig('v5a.png', dpi=100)

plt.rcParams['axes.titlesize'] = 8
plt.rcParams['axes.labelsize'] = 8
fig2, ax2 = plt.subplots(figsize=(6.4, 4.8))
ax2.plot(x, x ** 2)
ax2.set_title('After')
ax2.set_xlabel('x')
fig2.savefig('v5b.png', dpi=100)
