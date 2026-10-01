# round 6, the page reviewer's s10 (same-process): a figure, THEN plt.rc_context lowering title and label sizes for a second figure.
import matplotlib.pyplot as plt
import numpy as np

x = np.linspace(0, 1, 20)
fig1, ax1 = plt.subplots(figsize=(6.4, 4.8))
ax1.plot(x, x ** 2)
ax1.set_title('First')
ax1.set_xlabel('x')
fig1.savefig('s10a.png', dpi=100)

with plt.rc_context({'axes.titlesize': 8, 'axes.labelsize': 8}):
    fig2, ax2 = plt.subplots(figsize=(6.4, 4.8))
    ax2.plot(x, x ** 3)
    ax2.set_title('Second')
    ax2.set_xlabel('x')
fig2.savefig('s10b.png', dpi=100)
