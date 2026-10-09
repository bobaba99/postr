import numpy as np
import matplotlib.pyplot as plt

plt.rcParams['font.size'] = 20

x = np.linspace(0, 10, 50)
with plt.rc_context({'font.size': 7}):
    fig, ax = plt.subplots(figsize=(8, 6))
    ax.plot(x, np.sin(x), label='sin')
    ax.plot(x, np.cos(x), label='cos')
    ax.set_xlabel('Phase (rad)')
    ax.set_ylabel('Amplitude')
    ax.set_title('Two waves')
    ax.legend()
    fig.savefig('wave.png', dpi=300)
