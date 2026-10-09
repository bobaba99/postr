import numpy as np
import matplotlib.pyplot as plt

x = np.linspace(0, 10, 50)
with plt.style.context("seaborn-v0_8-talk"):
    fig, ax = plt.subplots(figsize=(6.4, 4.8))
    ax.plot(x, x ** 0.5, label="sqrt")
    ax.plot(x, np.log1p(x), label="log1p")
    ax.set_title("Style context: talk")
    ax.set_xlabel("x")
    ax.set_ylabel("f(x)")
    ax.legend()
    fig.savefig("style_talk.png", dpi=300)
