# round 6, skeptic-page-2's v3: a negative control (the context opens before any figure is made).
import matplotlib.pyplot as plt
import numpy as np

x = np.linspace(0, 1, 30)
with plt.rc_context({'axes.titlesize': 8, 'axes.labelsize': 8}):
    fig, ax = plt.subplots(figsize=(6.4, 4.8))
    ax.plot(x, x)
    ax.set_title('Inside')
    ax.set_xlabel('x')
    fig.savefig('v3a.png', dpi=100)

fig2, ax2 = plt.subplots(figsize=(6.4, 4.8))
ax2.plot(x, x ** 2)
ax2.set_title('Outside')
ax2.set_xlabel('x')
fig2.savefig('v3b.png', dpi=100)
