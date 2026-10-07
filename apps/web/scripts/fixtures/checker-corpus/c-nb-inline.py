#!/usr/bin/env python
# coding: utf-8

# In[1]:


import numpy as np
import matplotlib.pyplot as plt
get_ipython().run_line_magic('matplotlib', 'inline')
plt.rcParams['font.size'] = 12


# In[2]:


x = np.linspace(0, 10, 100)
fig, ax = plt.subplots(figsize=(10, 7))
ax.plot(x, np.sin(x), label="sin(x)")
ax.plot(x, np.sin(x) * np.exp(-x / 5), label="damped")
ax.set_title("Notebook figure")
ax.set_xlabel("time (s)")
ax.set_ylabel("signal")
ax.legend(loc="upper left", bbox_to_anchor=(1.0, 1.0))
plt.show()
