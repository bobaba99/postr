import numpy as np
import seaborn as sns
import matplotlib.pyplot as plt

rng = np.random.default_rng(1)
g = sns.jointplot(x=rng.normal(size=200), y=rng.normal(size=200), height=4.8)
g.set_axis_labels('Predictor', 'Outcome')
g.fig.suptitle('Joint distribution')
g.fig.subplots_adjust(top=0.92)
g.savefig('joint.png', dpi=150)
