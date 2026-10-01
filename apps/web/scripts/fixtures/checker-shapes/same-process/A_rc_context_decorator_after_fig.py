# round 6, skeptic-page-2's v4: a figure, THEN a function decorated with rc_context lowering title and label sizes.
import matplotlib as mpl
import matplotlib.pyplot as plt
import numpy as np

x = np.linspace(0, 1, 30)
fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.plot(x, x)
ax.set_title('Main')
ax.set_xlabel('x')
fig.savefig('v4a.png', dpi=100)


@mpl.rc_context({'axes.titlesize': 7, 'axes.labelsize': 7})
def thumbnail():
    f, a = plt.subplots(figsize=(6.4, 4.8))
    a.plot(x, x ** 3)
    a.set_title('Thumb')
    a.set_xlabel('x')
    f.savefig('v4b.png', dpi=100)


thumbnail()
