import matplotlib.pyplot as plt


def main():
    fig, ax = plt.subplots(figsize=(6.4, 4.8))
    ax.scatter([1, 2, 3], [3, 1, 2], label="pts")
    ax.set_xlabel("x")
    ax.set_ylabel("y")
    ax.set_title("Main")
    ax.legend()
    fig.savefig("main.png")


if __name__ == '__main__':
    main()
