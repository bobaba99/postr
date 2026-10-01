import numpy as np
import matplotlib.pyplot as plt

plt.rcParams['font.size'] = 20

months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
counts = [12, 15, 11, 18, 21, 17]
fig, ax = plt.subplots(figsize=(8, 6))
ax.plot(range(6), counts, marker='o')
ax.set_xticks(range(6))
ax.set_xticklabels(months, fontsize=8)
plt.setp(ax.get_yticklabels(), fontsize=8)
ax.set_xlabel('Month')
ax.set_ylabel('Admissions')
ax.set_title('Admissions by month')
fig.savefig('admissions.png', dpi=300)
