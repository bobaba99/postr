from concurrent.futures import ThreadPoolExecutor
from matplotlib.figure import Figure


def render(i):
    fig = Figure(figsize=(6.4, 4.8))
    ax = fig.add_subplot()
    ax.plot([0, 1, 2], [i, i + 1, i], label=f'series {i}')
    ax.set_title(f'Panel {i}')
    ax.set_xlabel('x')
    ax.set_ylabel('y')
    ax.legend()
    fig.savefig(f'panel{i}.png', dpi=100)
    return i


with ThreadPoolExecutor(max_workers=3) as pool:
    list(pool.map(render, range(3)))
