import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { PosterDoc } from '@postr/shared';
import { PosterSnapshotCanvas } from '../PosterSnapshotCanvas';

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', NoopResizeObserver);

const DOC: PosterDoc = {
  version: 1,
  widthIn: 48,
  heightIn: 36,
  blocks: [
    {
      id: 'title',
      type: 'title',
      x: 20,
      y: 20,
      w: 440,
      h: 30,
      content: 'A title long enough to wrap onto another line',
      imageSrc: null,
      imageFit: 'contain',
      tableData: null,
    },
    {
      id: 'body',
      type: 'text',
      x: 20,
      y: 100,
      w: 210,
      h: 150,
      content: 'Downstream poster content',
      imageSrc: null,
      imageFit: 'contain',
      tableData: null,
    },
  ],
  fontFamily: 'Source Sans 3',
  palette: {
    bg: '#ffffff',
    primary: '#1a1a26',
    accent: '#7c6aed',
    accent2: '#4a6cf7',
    muted: '#6b7280',
    headerBg: '#f3f4f6',
    headerFg: '#1a1a26',
  },
  styles: {
    title: {
      size: 60,
      weight: 700,
      italic: false,
      lineHeight: 1.1,
      color: null,
      highlight: null,
    },
    heading: {
      size: 28,
      weight: 700,
      italic: false,
      lineHeight: 1.2,
      color: null,
      highlight: null,
    },
    authors: {
      size: 22,
      weight: 400,
      italic: false,
      lineHeight: 1.3,
      color: null,
      highlight: null,
    },
    body: {
      size: 18,
      weight: 400,
      italic: false,
      lineHeight: 1.4,
      color: null,
      highlight: null,
    },
  },
  headingStyle: { border: 'bottom', fill: false, align: 'left' },
  institutions: [],
  authors: [],
  references: [],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PosterSnapshotCanvas', () => {
  it("shifts downstream blocks by the wrapped title's measured overflow", () => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(
      function measuredHeight(this: HTMLElement) {
        return this.dataset.blockId === 'title' ? 70 : 0;
      },
    );

    const { container } = render(<PosterSnapshotCanvas doc={DOC} />);

    expect(
      container.querySelector<HTMLElement>('[data-block-id="body"]'),
    ).toHaveStyle({ top: '140px' });
  });
});
