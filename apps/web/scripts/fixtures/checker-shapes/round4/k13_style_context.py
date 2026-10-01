import matplotlib.pyplot as plt

with plt.style.context('ggplot'):
    fig, ax = plt.subplots(figsize=(6.4, 4.8))
    ax.plot([1, 2, 3], [2, 1, 3], label='series')
    ax.set_title('Styled')
    ax.set_xlabel('x')
    ax.set_ylabel('y')
    ax.legend()
    fig.savefig('styled.png', dpi=150)
