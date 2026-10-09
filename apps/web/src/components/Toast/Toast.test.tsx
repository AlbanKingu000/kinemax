import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider';
import { useToast, type ToastOptions } from './toast-context';
import { ToastProvider } from './ToastProvider';

function Trigger({ options }: { options: ToastOptions }) {
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={() => {
        toast.show(options);
      }}
    >
      show
    </button>
  );
}

function renderWith(options: ToastOptions) {
  render(
    <I18nProvider locale="en">
      <ToastProvider>
        <Trigger options={options} />
      </ToastProvider>
    </I18nProvider>,
  );
  return () => {
    fireEvent.click(screen.getByRole('button', { name: 'show' }));
  };
}

describe('ToastProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('has a labelled region with a polite live list from the start', () => {
    renderWith({ title: 'x' });
    const region = screen.getByRole('region', { name: 'Notifications' });
    expect(region.querySelector('ol')).toHaveAttribute('aria-live', 'polite');
  });

  it('shows a toast and closes it after its duration', () => {
    const show = renderWith({ tone: 'success', title: 'Booking saved', description: 'Sent.' });
    show();
    expect(screen.getByText('Booking saved')).toBeInTheDocument();
    expect(screen.getByText('Sent.')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(screen.queryByText('Booking saved')).toBeNull();
  });

  it('uses role alert for errors and can be dismissed', () => {
    const show = renderWith({ tone: 'error', title: 'Payment failed', duration: 0 });
    show();
    expect(screen.getByRole('alert')).toHaveTextContent('Payment failed');
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('pauses while hovered and keeps at most three', () => {
    const show = renderWith({ title: 'Info', duration: 1000 });
    show();
    const toast = screen.getByText('Info').closest('li') as HTMLElement;
    fireEvent.mouseEnter(toast);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText('Info')).toBeInTheDocument();
    fireEvent.mouseLeave(toast);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByText('Info')).toBeNull();

    show();
    show();
    show();
    show();
    expect(screen.getAllByText('Info')).toHaveLength(3);
  });

  it('pauses while focused', () => {
    const show = renderWith({ title: 'Focus me', duration: 1000 });
    show();
    const toast = screen.getByText('Focus me').closest('li') as HTMLElement;
    fireEvent.focus(toast);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText('Focus me')).toBeInTheDocument();
    fireEvent.blur(toast);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByText('Focus me')).toBeNull();
  });

  it('throws a clear error outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Trigger options={{ title: 'x' }} />)).toThrow(
      'useToast must be used inside <ToastProvider>',
    );
  });
});
