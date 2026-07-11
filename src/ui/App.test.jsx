import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App, EVENTS_UNAVAILABLE_MESSAGE, PROFILE_HANDLE_PLACEHOLDER } from './App.jsx';

describe('Portal app shell', () => {
  it('renders the authenticated entry surface and explains missing local config', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByText('Firebase environment configuration is missing.')).toBeInTheDocument();
  });

  it('uses a concise Events availability message', () => {
    expect(EVENTS_UNAVAILABLE_MESSAGE).toBe('Events are temporarily unavailable. Please try again shortly.');
  });

  it('keeps the handle choice empty until the member provides one', () => {
    expect(PROFILE_HANDLE_PLACEHOLDER).toBe('Choose your unique handle');
  });
});
