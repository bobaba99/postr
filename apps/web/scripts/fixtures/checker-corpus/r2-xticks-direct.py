import numpy as np
import matplotlib.pyplot as plt

genes = ['BRCA1', 'TP53', 'EGFR', 'MYC', 'KRAS', 'PTEN', 'APC', 'RB1']
fold = np.array([1.8, -2.1, 3.2, 0.7, -0.9, 2.4, -1.5, 1.1])
plt.figure(figsize=(9, 5))
plt.bar(genes, fold, color=['tab:blue' if f > 0 else 'tab:orange' for f in fold])
plt.axhline(0, color='k', lw=0.8)
plt.xticks(rotation=45, ha='right', fontsize=8)
plt.yticks(fontsize=8)
plt.ylabel('log2 fold change', fontsize=12)
plt.title('Differential expression', fontsize=14)
plt.tight_layout()
plt.savefig('genes.png', dpi=300)
