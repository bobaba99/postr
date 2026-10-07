import numpy as np
import matplotlib.pyplot as plt

months = np.arange(1, 13)
temp = 10 + 12 * np.sin((months - 4) / 12 * 2 * np.pi)
rain = 60 + 30 * np.cos(months / 12 * 2 * np.pi)

fig, ax1 = plt.subplots(figsize=(7, 4.5))
ax1.plot(months, temp, color='tab:red', marker='o', label='Temperature')
ax1.set_xlabel('Month', fontsize=14)
ax1.set_ylabel('Temperature (°C)', fontsize=14, color='tab:red')
ax1.tick_params(axis='both', labelsize=12)
ax2 = ax1.twinx()
ax2.bar(months, rain, alpha=0.3, label='Rainfall')
ax2.set_ylabel('Rainfall (mm)', fontsize=14)
fig.legend(loc='upper left', bbox_to_anchor=(0.12, 0.9), fontsize=11)
fig.tight_layout()
fig.savefig('climate.png', dpi=300)
