import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App.jsx';

describe('Portal app shell', () => {
  it('renders the canonical Portal home surface', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: "Humanity's living memory" })).toBeInTheDocument();
    expect(screen.getByText('Incoming reports')).toBeInTheDocument();
  });
});
