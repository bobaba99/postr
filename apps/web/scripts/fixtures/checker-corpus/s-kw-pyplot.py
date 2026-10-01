import numpy as np
import matplotlib.pyplot as plt

dose = np.array([0, 1, 2, 5, 10, 20])
resp = np.array([0.1, 0.25, 0.4, 0.62, 0.8, 0.9])
plt.figure(figsize=(6, 4))
plt.plot(dose, resp, 'o-', label='Compound A')
plt.plot(dose, resp * 0.7, 's--', label='Compound B')
plt.xlabel('Dose (mg/kg)', fontsize=9)
plt.ylabel('Response', fontsize=9)
plt.xticks(fontsize=7)
plt.yticks(fontsize=7)
plt.title('Dose response', fontsize=11)
plt.legend(fontsize=7)
plt.savefig('dose.png', dpi=300)
