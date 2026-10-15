import { act, renderHook } from '@testing-library/react';
import type { FocusEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import tokensCss from '../styles/tokens.css?raw';
import { HINT_MS, IDLE_MS, useAutoHide, useLookHint } from './use-auto-hide';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  window.sessionStorage.clear();
});

const blur = (inside: boolean) => {
  const panel = document.createElement('div');
  const button = document.createElement('button');
  panel.append(button);
  return {
    currentTarget: panel,
    relatedTarget: inside ? button : document.body,
  } as unknown as FocusEvent<HTMLElement>;
};

describe('useAutoHide', () => {
  it('hides the panel as soon as the user looks around', () => {
    const { result } = renderHook(() => useAutoHide());
    expect(result.current.hidden).toBe(false);
    act(() => {
      result.current.look();
    });
    expect(result.current.hidden).toBe(true);
  });

  it('shows it again once the view has been still for 800 ms', () => {
    const { result } = renderHook(() => useAutoHide());
    act(() => {
      result.current.look();
    });
    // Looking on keeps it hidden: the idle time starts again with every move.
    act(() => {
      vi.advanceTimersByTime(IDLE_MS - 100);
      result.current.look();
      vi.advanceTimersByTime(IDLE_MS - 100);
    });
    expect(result.current.hidden).toBe(true);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current.hidden).toBe(false);
    expect(IDLE_MS).toBe(800);
  });

  it('never hides while keyboard focus is inside the panel', () => {
    const { result } = renderHook(() => useAutoHide());
    act(() => {
      result.current.panelProps.onFocus();
      result.current.look();
    });
    expect(result.current.hidden).toBe(false);
    // Focus moving between the panel's own buttons keeps it shown.
    act(() => {
      result.current.panelProps.onBlur(blur(true));
    });
    expect(result.current.hidden).toBe(false);
    act(() => {
      result.current.panelProps.onBlur(blur(false));
    });
    expect(result.current.hidden).toBe(true);
  });

  it('never hides while the pointer is over the panel, and shows at once when it arrives', () => {
    const { result } = renderHook(() => useAutoHide());
    act(() => {
      result.current.look();
    });
    expect(result.current.hidden).toBe(true);
    act(() => {
      result.current.panelProps.onPointerEnter();
    });
    expect(result.current.hidden).toBe(false);
    act(() => {
      result.current.look();
    });
    expect(result.current.hidden).toBe(false);
    act(() => {
      result.current.panelProps.onPointerLeave();
    });
    expect(result.current.hidden).toBe(true);
  });

  it('fades in ~150 ms / ~250 ms, instantly with reduced motion', () => {
    const token = (name: string) => new RegExp(`--${name}:\\s*([\\d.]+)ms;`, 'g');
    const values = (name: string) => [...tokensCss.matchAll(token(name))].map((m) => m[1]);
    // The normal value first, then the reduced-motion override.
    expect(values('duration-overlay-out')).toEqual(['150', '0.01']);
    expect(values('duration-overlay-in')).toEqual(['250', '0.01']);
  });
});

describe('useLookHint', () => {
  it('shows only for the first seconds of the first seat view in the session', () => {
    const { result, rerender } = renderHook(({ seated }) => useLookHint(seated), {
      initialProps: { seated: false },
    });
    expect(result.current).toBe(false);
    rerender({ seated: true });
    expect(result.current).toBe(true);
    act(() => {
      vi.advanceTimersByTime(HINT_MS);
    });
    expect(result.current).toBe(false);
    // Another seat view, even on a new page in the same session: no hint.
    rerender({ seated: false });
    rerender({ seated: true });
    expect(result.current).toBe(false);
    const again = renderHook(() => useLookHint(true));
    expect(again.result.current).toBe(false);
  });
});
