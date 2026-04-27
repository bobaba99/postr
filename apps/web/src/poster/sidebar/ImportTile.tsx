/**
 * ImportTile — sidebar entry point for "import a PDF / .postr file
 * into the current poster". Lives in the Layout tab.
 *
 * Two display modes driven by `blocksCount`:
 *   - prominent (≤ 2 blocks, i.e. blank/new poster) — full tile
 *   - subtle (> 2 blocks) — small text link below the templates
 */
interface Props {
  blocksCount: number;
  onClick: () => void;
}

export function ImportTile({ blocksCount, onClick }: Props) {
  const prominent = blocksCount <= 2;

  if (prominent) {
    return (
      <button
        type="button"
        onClick={onClick}
        data-postr-import-tile
        style={{
          all: 'unset',
          cursor: 'pointer',
          display: 'block',
          width: '100%',
          marginTop: 8,
          padding: '14px 16px',
          borderRadius: 8,
          background: 'linear-gradient(135deg, rgba(124, 106, 237, 0.12), rgba(124, 106, 237, 0.04))',
          border: '1px solid rgba(124, 106, 237, 0.4)',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 14,
            fontWeight: 600,
            color: '#c8b6ff',
            marginBottom: 4,
          }}
        >
          <span style={{ fontSize: 18 }}>📥</span>
          Import PDF / .postr
        </div>
        <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.5 }}>
          Drop an existing poster — text and figures land as editable blocks.
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      data-postr-import-tile
      style={{
        all: 'unset',
        cursor: 'pointer',
        marginTop: 10,
        padding: '6px 0',
        fontSize: 12,
        color: '#9ca3af',
        textDecoration: 'underline',
        textDecorationColor: '#3a3a4a',
        textUnderlineOffset: 3,
      }}
    >
      Replace with PDF / .postr import…
    </button>
  );
}
