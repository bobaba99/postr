import numpy as np
import matplotlib
import matplotlib.pyplot as plt
fig = plt.figure(figsize=(6.4, 4.8), layout='constrained')
sf = fig.subfigures(1, 2)
for p, s in enumerate(sf, 1):
    ax = s.subplots()
    ax.plot([1, 2, 3], [1, 3, 2], label=f'L{p}_a')
    ax.set_title(f'T{p}_title', fontsize=8)
    ax.set_xlabel(f'X{p}_label', fontsize=8)
    ax.set_ylabel(f'Y{p}_label', fontsize=8)
    ax.tick_params(labelsize=7)
    ax.legend(fontsize=7)
    s.suptitle(f'S_sub{p}')
fig.savefig('f14.pdf')
