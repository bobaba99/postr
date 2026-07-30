/**
 * VibeField.test.tsx — test suite for the VibeField component.
 *
 * Tests:
 * 1. Renders the text input with the correct placeholder
 * 2. Renders 2 suggested prompts (default if not provided)
 * 3. Tapping a suggestion fills the field and calls onSubmit with the suggestion text
 * 4. Typing text + submitting (Enter) calls onSubmit with the typed value
 * 5. The input value is controlled via the `value` prop and updated via `onChange`
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VibeField } from '../VibeField';

describe('VibeField', () => {
  const defaultProps = {
    value: '',
    onChange: vi.fn(),
    onSubmit: vi.fn(),
  };

  it('renders the text input with placeholder', () => {
    render(<VibeField {...defaultProps} />);
    const input = screen.getByPlaceholderText(/Describe the vibe/i);
    expect(input).toBeInTheDocument();
  });

  it('renders the text input with an accessible label', () => {
    render(<VibeField {...defaultProps} />);
    expect(screen.getByLabelText('Describe the vibe')).toBeInTheDocument();
  });

  it('renders 2 default suggestions when none provided', () => {
    render(<VibeField {...defaultProps} />);
    const buttons = screen.getAllByRole('button');
    // Two suggestion buttons
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    // Check that default suggestions are present
    expect(screen.getByText(/Clean & minimal/i)).toBeInTheDocument();
    expect(screen.getByText(/Confident & bold/i)).toBeInTheDocument();
  });

  it('renders custom suggestions when provided', () => {
    const customSuggestions = [
      'Minimalist monochrome',
      'Vibrant rainbow energy',
    ];
    render(
      <VibeField {...defaultProps} suggestions={customSuggestions} />
    );
    expect(screen.getByText('Minimalist monochrome')).toBeInTheDocument();
    expect(screen.getByText('Vibrant rainbow energy')).toBeInTheDocument();
  });

  it('calls onSubmit with suggestion text when a suggestion is clicked', () => {
    const onSubmit = vi.fn();
    render(
      <VibeField
        {...defaultProps}
        onSubmit={onSubmit}
        suggestions={['Test vibe 1', 'Test vibe 2']}
      />
    );

    const suggestionButton = screen.getByText('Test vibe 1');
    fireEvent.click(suggestionButton);

    expect(onSubmit).toHaveBeenCalledWith('Test vibe 1');
  });

  it('calls onChange when user types in the input', () => {
    const onChange = vi.fn();
    render(
      <VibeField {...defaultProps} onChange={onChange} />
    );

    const input = screen.getByPlaceholderText(/Describe the vibe/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'A custom vibe' } });

    expect(onChange).toHaveBeenCalled();
  });

  it('calls onSubmit with typed value when Enter is pressed', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    const { rerender } = render(
      <VibeField value="" onChange={onChange} onSubmit={onSubmit} />
    );

    const input = screen.getByPlaceholderText(/Describe the vibe/i) as HTMLInputElement;

    // Update the component with the new value
    rerender(
      <VibeField value="My custom vibe" onChange={onChange} onSubmit={onSubmit} />
    );

    // Press Enter
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(onSubmit).toHaveBeenCalledWith('My custom vibe');
  });

  it('displays the current value in the input', () => {
    const { rerender } = render(
      <VibeField value="" onChange={vi.fn()} onSubmit={vi.fn()} />
    );

    let input = screen.getByPlaceholderText(/Describe the vibe/i) as HTMLInputElement;
    expect(input.value).toBe('');

    rerender(
      <VibeField value="My vibe" onChange={vi.fn()} onSubmit={vi.fn()} />
    );

    input = screen.getByPlaceholderText(/Describe the vibe/i) as HTMLInputElement;
    expect(input.value).toBe('My vibe');
  });
});
