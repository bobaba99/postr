import matplotlib.pyplot as plt


class Plotter:
    def __init__(self, savefig=None):
        self.savefig = savefig

    def run(self):
        fig, ax = plt.subplots(figsize=(6.4, 4.8))
        ax.plot([1, 2, 3], [1, 2, 1], label="control")
        ax.set_xlabel("time (s)")
        ax.set_ylabel("signal")
        ax.set_title("Result")
        ax.legend()
        if self.savefig:
            fig.savefig(self.savefig)
        return fig


Plotter(savefig="a.png").run()
