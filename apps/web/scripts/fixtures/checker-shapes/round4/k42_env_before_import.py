import os
import tempfile

# Lab cluster setup: a writable config dir holding the lab's matplotlibrc.
cfg = tempfile.mkdtemp()
with open(os.path.join(cfg, 'matplotlibrc'), 'w') as fh:
    fh.write('savefig.bbox: tight\nfigure.facecolor: 0.9\n')
os.environ['MPLCONFIGDIR'] = cfg

import matplotlib
import matplotlib.pyplot as plt

fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.plot([1, 2, 3], [2, 1, 3], label='series')
ax.set_title('Lab style')
ax.set_xlabel('x')
ax.set_ylabel('y')
ax.legend()
print('savefig.bbox =', matplotlib.rcParams['savefig.bbox'])
fig.savefig('lab.png', dpi=100)
