# round 6, the page reviewer's s11 (same-process): a figure, THEN plt.style.context('seaborn-v0_8-paper') for a second figure.
import matplotlib.pyplot as plt
import numpy as np

x = np.linspace(0, 1, 20)
fig1, ax1 = plt.subplots(figsize=(6.4, 4.8))
ax1.plot(x, x ** 2, label='square')
ax1.set_title('Default style')
ax1.legend()
fig1.savefig('s11a.png', dpi=100)

with plt.style.context('seaborn-v0_8-paper'):
    fig2, ax2 = plt.subplots(figsize=(6.4, 4.8))
    ax2.plot(x, x ** 3, label='cube')
    ax2.set_title('Paper style')
    ax2.legend()
    fig2.savefig('s11b.png', dpi=100)
