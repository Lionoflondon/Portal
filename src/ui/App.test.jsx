import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App.jsx';

describe('Portal app shell', () => {
  it('renders the authenticated entry surface and explains missing local config', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByText('Firebase environment configuration is missing.')).toBeInTheDocument();
  });
});
