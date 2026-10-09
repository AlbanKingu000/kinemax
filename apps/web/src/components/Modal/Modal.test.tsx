import { fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider';
import { Modal } from './Modal';

function Harness({ withInitialFocus = false }: { withInitialFocus?: boolean }) {
  const [open, setOpen] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  return (
    <I18nProvider locale="en">
      <main>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
          }}
        >
          Open
        </button>
      </main>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title="Confirm your booking"
        {...(withInitialFocus ? { initialFocusRef: confirmRef } : {})}
        footer={
          <>
            <button type="button">Cancel</button>
            <button type="button" ref={confirmRef}>
              Confirm
            </button>
          </>
        }
      >
        <p>Two seats in Hall 3.</p>
      </Modal>
    </I18nProvider>
  );
}

function open() {
  const trigger = screen.getByRole('button', { name: 'Open' });
  trigger.focus();
  fireEvent.click(trigger);
  return trigger;
}

describe('Modal', () => {
  it('renders nothing while closed', () => {
    render(<Harness />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens as a labelled modal, focuses the first control and makes the page inert', () => {
    render(<Harness />);
    open();
    const dialog = screen.getByRole('dialog', { name: 'Confirm your booking' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    expect(screen.getByRole('main', { hidden: true }).parentElement?.inert).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('traps Tab and Shift+Tab inside the dialog', () => {
    render(<Harness />);
    open();
    const dialog = screen.getByRole('dialog');
    const close = screen.getByRole('button', { name: 'Close' });
    const confirm = screen.getByRole('button', { name: 'Confirm' });

    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(confirm).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(close).toHaveFocus();
    // Tab in the middle is left to the browser.
    screen.getByRole('button', { name: 'Cancel' }).focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Enter' });
    expect(dialog).toBeInTheDocument();
  });

  it('closes with Escape and restores focus and the page', () => {
    render(<Harness />);
    const trigger = open();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger).toHaveFocus();
    expect(trigger.closest('main')?.parentElement?.inert).toBe(false);
    expect(document.body.style.overflow).toBe('');
  });

  it('closes with the close button and the backdrop, and honours initial focus', () => {
    const { container } = render(<Harness withInitialFocus />);
    open();
    expect(screen.getByRole('button', { name: 'Confirm' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    open();
    const backdrop = document.body.querySelector('[aria-hidden="true"]:not(svg)');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as Element);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(container).toBeInTheDocument();
  });

  it('keeps focus on the panel when nothing inside is focusable', () => {
    render(
      <Modal open onClose={() => undefined} title="Info">
        <p>Text only</p>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    const close = screen.getByRole('button', { name: 'Mbyll' });
    close.setAttribute('disabled', '');
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(dialog).toBeInTheDocument();
  });
});
