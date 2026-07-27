/**
 * Route-level behaviour of the deactivated public gallery.
 *
 * The gallery page components, data layer, admin moderation page and
 * database all still exist — only the public routes are switched off.
 * These tests pin the deactivation contract: /gallery and
 * /gallery/:entryId must client-side redirect (replace) to the
 * landing page instead of rendering the gallery.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '../routes';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}</div>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('deactivated public gallery routes', () => {
  it('redirects /gallery to the landing page', async () => {
    renderAt('/gallery');

    expect(await screen.findByTestId('location-probe')).toHaveTextContent(
      /^\/$/,
    );
    expect(screen.getByText(/conference posters/i)).toBeInTheDocument();
  });

  it('redirects /gallery/:entryId to the landing page', async () => {
    renderAt('/gallery/some-entry-id');

    expect(await screen.findByTestId('location-probe')).toHaveTextContent(
      /^\/$/,
    );
    expect(screen.getByText(/conference posters/i)).toBeInTheDocument();
  });
});
