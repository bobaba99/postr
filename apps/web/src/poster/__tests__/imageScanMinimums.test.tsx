/**
 * Plan item 13 part 2, stream Q, cause RC5 — the editor's image scan
 * ("Scan image", Figure › Check a figure with an image block selected)
 * judges figure text against the canonical minimums (titles and axis titles
 * 18 pt, tick labels and legend text 14 pt) with the code check's warning
 * band (within 15% below the minimum is ⚠), not its old 24/24/18 with a
 * 25% band. Record: docs/fixes/13c-chart-text-minimums.md.
 *
 * Entered the way a user enters it: the Figure tab with an image block
 * selected, "Scan image" pressed; the scan's API answer is faked.
 *
 * Re-run: npx vitest run src/poster/__tests__/imageScanMinimums.test.tsx
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { Block } from '@postr/shared';

const scan = vi.hoisted(() => ({ regions: [] as Array<{ text: string; bbox: { x: number; y: number; w: number; h: number }; role: string }> }));
vi.mock('@/lib/apiClient', () => ({
  postJson: vi.fn(async () => ({ imagePixelWidth: 1000, imagePixelHeight: 700, regions: scan.regions })),
  ApiError: class extends Error {},
}));
vi.mock('@/data/posterImages', async (orig) => ({
  ...(await orig<typeof import('@/data/posterImages')>()),
  resolveStorageUrl: vi.fn(async () => 'https://example.test/figure.png'),
}));

import { FigureTab } from '../sidebar/FigureTab';

describe('Scan image — the canonical minimums and the 15% warning band', () => {
  it('judges each role against its minimum, ⚠ only within 15% below it', async () => {
    const image = { id: 'img1', type: 'image', x: 0, y: 0, w: 100, h: 70, content: '', imageSrc: 'u1/img.png', imageFit: 'contain', tableData: null } as Block;
    // 1000 × 700 px image in a 10 × 7 in block: a box h px tall prints at 0.72 × h pt.
    const at = (pt: number) => ({ x: 0, y: 0, w: 100, h: pt / 0.72 });
    scan.regions = [
      { text: 'Mean', role: 'title', bbox: at(18) },            // = 18: ✓ (24 before: ⚠)
      { text: 'Score', role: 'axis-title', bbox: at(15.5) },    // ≥ 15.3: ⚠
      { text: '10', role: 'axis-tick', bbox: at(11) },          // < 11.9: ✗ (a 25% band said ⚠)
      { text: 'Control', role: 'legend', bbox: at(14) },        // = 14: ✓
      { text: 'n = 12', role: 'data', bbox: at(12) },           // ≥ 11.9: ⚠ against 14
      { text: 'Source', role: 'other', bbox: at(14) },          // ✓ against 14
      { text: 'Week 1', role: 'strip', bbox: at(13) },          // a role the table has no row for: other's 14, ⚠
    ];
    render(
      <FigureTab mode="check" onChangeMode={() => {}} selectedImageBlock={image} defaultFigureWidthIn={10} defaultFigureHeightIn={7}
        palette={{ bg: '#fff', primary: '#000', accent: '#00f', accent2: '#f00', muted: '#666', headerBg: '#000', headerFg: '#fff' }}
        fontFamily="Georgia, serif" posterTables={[]} onInsertChart={() => {}} selectedChartBlock={null} onUpdateChartSpec={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Scan image/ }));
    await screen.findByText('Mean');
    const cells = (text: string) => within(screen.getByText(text).closest('tr')!).getAllByRole('cell').map((c) => c.textContent);
    expect(cells('Mean')).toEqual(['✓', 'title', 'Mean', '18.0', '18']);
    expect(cells('Score')).toEqual(['⚠', 'axis-title', 'Score', '15.5', '18']);
    expect(cells('10')).toEqual(['✗', 'axis-tick', '10', '11.0', '14']);
    expect(cells('Control')).toEqual(['✓', 'legend', 'Control', '14.0', '14']);
    expect(cells('n = 12')).toEqual(['⚠', 'data', 'n = 12', '12.0', '14']);
    expect(cells('Source')).toEqual(['✓', 'other', 'Source', '14.0', '14']);
    expect(cells('Week 1')).toEqual(['⚠', 'strip', 'Week 1', '13.0', '14']);
  });
});
