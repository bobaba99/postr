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
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../routes';

// The presentation-checker page pulls in the review API client and the
// ingest layer; routing behaviour doesn't need them.
vi.mock('@/pages/PresentationChecker', () => ({
  default: () => <h1>Presentation Checker</h1>,
}));

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
    expect(screen.getByText(/academic posters/i)).toBeInTheDocument();
  });

  it('redirects /gallery/:entryId to the landing page', async () => {
    renderAt('/gallery/some-entry-id');

    expect(await screen.findByTestId('location-probe')).toHaveTextContent(
      /^\/$/,
    );
    expect(screen.getByText(/academic posters/i)).toBeInTheDocument();
  });
});

describe('presentation checker route', () => {
  it('serves /presentation-checker publicly — registered, not redirected', async () => {
    renderAt('/presentation-checker');

    expect(
      await screen.findByRole('heading', {
        name: /presentation checker/i,
        level: 1,
      }),
    ).toBeInTheDocument();
    // …and the URL stays put (no alias redirect).
    expect(await screen.findByTestId('location-probe')).toHaveTextContent(
      /^\/presentation-checker$/,
    );
  });
});
