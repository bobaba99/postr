import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Link, MemoryRouter, useLocation, useNavigate } from 'react-router';
import { RouteScrollManager } from '../RouteScrollManager';

function NavigationFixture() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <>
      <RouteScrollManager />
      <span data-testid="location">
        {location.pathname}
        {location.hash}
      </span>
      <Link to="/next">Push</Link>
      <Link to="/next#details">Hash</Link>
      <button type="button" onClick={() => navigate('/replacement', { replace: true })}>
        Replace
      </button>
    </>
  );
}

function renderNavigation(initialEntries = ['/start']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <NavigationFixture />
    </MemoryRouter>,
  );
}

describe('RouteScrollManager', () => {
  const scrollTo = vi.fn();

  beforeEach(() => {
    scrollTo.mockReset();
    vi.stubGlobal('scrollTo', scrollTo);
  });

  it('starts pushed routes at the top', async () => {
    renderNavigation();
    scrollTo.mockClear();

    fireEvent.click(screen.getByRole('link', { name: 'Push' }));

    await waitFor(() => {
      expect(scrollTo).toHaveBeenCalledWith({
        top: 0,
        left: 0,
        behavior: 'auto',
      });
    });
  });

  it('starts replaced routes at the top', async () => {
    renderNavigation();
    scrollTo.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));

    await waitFor(() => {
      expect(scrollTo).toHaveBeenCalledWith({
        top: 0,
        left: 0,
        behavior: 'auto',
      });
    });
  });

  it('leaves initial POP restoration to the browser', () => {
    renderNavigation();

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('does not override hash navigation', async () => {
    renderNavigation();
    scrollTo.mockClear();

    fireEvent.click(screen.getByRole('link', { name: 'Hash' }));

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/next#details');
    });
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
