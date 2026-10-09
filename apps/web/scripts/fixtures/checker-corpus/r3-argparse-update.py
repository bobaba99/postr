import argparse

import numpy as np
import matplotlib.pyplot as plt

parser = argparse.ArgumentParser()
parser.add_argument('--font-size', default='9')
args = parser.parse_args([])

plt.rcParams.update({'font.size': args.font_size})

rng = np.random.default_rng(3)
fig, ax = plt.subplots(figsize=(6.4, 4.8))
ax.hist(rng.normal(size=300), bins=20, label='sample')
ax.set_title('Distribution')
ax.set_xlabel('Value')
ax.set_ylabel('Count')
ax.legend()
fig.savefig('hist.png', dpi=150)
