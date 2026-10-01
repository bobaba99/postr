import matplotlib.pyplot as plt

fig = plt.figure(figsize=(6.4, 4.8))
top, bottom = fig.subfigures(2, 1)
a = top.subplots()
a.plot([1, 2, 3], [1, 2, 3])
a.set_xlabel("x")
a.set_ylabel("y")
b = bottom.subplots()
b.plot([1, 2, 3], [3, 2, 1])
b.set_xlabel("x")
plt.tight_layout()
fig.savefig("subtight.png")
