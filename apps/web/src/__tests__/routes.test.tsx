/**
 * Route-level behaviour of the deactivated features.
 *
 * The page components, data layers, admin pages and database for the
 * public gallery, the manuscript pipelines (/paper-to-poster,
 * /paper-to-slides), the Presentation Checker and the standalone plot
 * picker (/chart-chooser) all still exist — only their routes are
 * switched off (see the routes.tsx header). These tests pin the
 * deactivation contract: each route must client-side redirect
 * (replace) to the landing page instead of rendering the feature.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
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

/**
 * The manuscript pipelines and the Presentation Checker are deactivated,
 * not deleted. Their canonical routes AND their alias spellings all end
 * on the landing page in one hop — an alias pointing at a route that
 * itself redirects would work but double-hop.
 */
describe('deactivated manuscript pipeline + presentation checker routes', () => {
  it.each([
    '/paper-to-poster',
    '/manuscript-to-poster',
    '/paper-to-slides',
    '/paper-to-present',
    '/paper-to-presentation',
    '/presentation-checker',
  ])('redirects %s to the landing page', async (path) => {
    renderAt(path);

    expect(await screen.findByTestId('location-probe')).toHaveTextContent(
      /^\/$/,
    );
    expect(screen.getByText(/academic posters/i)).toBeInTheDocument();
  });
});

/**
 * The standalone plot picker is deactivated too (2026-09-10, while it
 * is revamped in another worktree). Its canonical route and its alias
 * spelling both land on the landing page in one hop. charts/* itself
 * stays live inside the editor's Figure tab — only the page is off.
 */
describe('deactivated standalone plot picker routes', () => {
  it.each(['/chart-chooser', '/plot-picker'])(
    'redirects %s to the landing page',
    async (path) => {
      renderAt(path);

      expect(await screen.findByTestId('location-probe')).toHaveTextContent(
        /^\/$/,
      );
      expect(screen.getByText(/academic posters/i)).toBeInTheDocument();
    },
  );
});
