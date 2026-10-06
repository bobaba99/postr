def make_figure(df):
    """Plot the dose-response curve for the poster."""
    fig, axes = plt.subplots(1, 2, figsize=(10, 4))
    axes[0].plot(df.dose, df.response)
    axes[1].hist(df.response, bins=20)
    return fig
