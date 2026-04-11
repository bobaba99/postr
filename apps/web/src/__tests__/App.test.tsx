import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from '../App';

describe('App', () => {
  it('renders the landing page', () => {
    render(<App />);
    expect(screen.getByText(/conference posters/i)).toBeInTheDocument();
    expect(screen.getByText(/get started free/i)).toBeInTheDocument();
  });
});
