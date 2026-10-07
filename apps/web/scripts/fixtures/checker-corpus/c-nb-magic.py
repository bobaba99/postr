%matplotlib inline
%config InlineBackend.figure_format = 'retina'
import numpy as np
import matplotlib.pyplot as plt
plt.rcParams.update({'font.size': 12})

x = np.linspace(0, 4, 60)
fig, ax = plt.subplots(figsize=(8, 6))
ax.plot(x, x ** 2, label="quadratic")
ax.plot(x, 2 ** x, label="exponential")
ax.set_title("Growth")
ax.set_xlabel("x")
ax.set_ylabel("y")
ax.legend()
plt.show()
