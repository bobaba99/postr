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
          padding: '16px 18px',
          borderRadius: 10,
          // Solid purple fill (matches the dashboard primary CTA)
          // so a brand-new poster's most prominent path is "import
          // an existing poster" rather than "manually arrange a
          // template" — the latter is good but the former saves
          // researchers a 30-minute typing session.
          background: 'linear-gradient(135deg, #7c6aed 0%, #9d87ff 100%)',
          border: '1px solid #7c6aed',
          boxShadow: '0 6px 20px rgba(124, 106, 237, 0.25)',
          boxSizing: 'border-box',
          transition:
            'transform 160ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 160ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
          (e.currentTarget as HTMLElement).style.boxShadow =
            '0 10px 28px rgba(124, 106, 237, 0.35)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.transform = 'none';
          (e.currentTarget as HTMLElement).style.boxShadow =
            '0 6px 20px rgba(124, 106, 237, 0.25)';
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 15,
            fontWeight: 700,
            color: '#ffffff',
            marginBottom: 6,
          }}
        >
          <span style={{ fontSize: 20 }}>📥</span>
          Import existing poster
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'rgba(255, 255, 255, 0.85)',
            lineHeight: 1.5,
          }}
        >
          Drop a PDF, image, or .postr bundle. Text + headings land at
          their original positions — figures get re-added with the
          Insert tab.
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
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginTop: 10,
        padding: '6px 10px',
        fontSize: 12,
        fontWeight: 500,
        color: '#c8b6ff',
        background: 'rgba(124, 106, 237, 0.1)',
        border: '1px solid rgba(124, 106, 237, 0.3)',
        borderRadius: 6,
      }}
    >
      <span aria-hidden>📥</span>
      Replace with PDF / image / .postr…
    </button>
  );
}
