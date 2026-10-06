fig = plt.figure(figsize=(6, 4))
ax = fig.add_subplot(111)
ax.errorbar(groups, means, yerr=sds, fmt='o')
ax.set_ylabel('Mean response')
