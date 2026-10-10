import numpy as np
import matplotlib.pyplot as plt

plt.rcParams['font.size'] = 9
x = np.linspace(0, 10, 50)
fig, ax = plt.subplots()
ax.plot(x, np.sin(x), label='a long legend entry for sin')
ax.plot(x, np.cos(x), label='a long legend entry for cos')
ax.set_title('Response over time')
ax.set_xlabel('Time (s)')
ax.set_ylabel('Signal')
ax.legend(loc='upper left', bbox_to_anchor=(1.02, 1))
fig.savefig('fig.png', dpi=300, bbox_inches='tight')
