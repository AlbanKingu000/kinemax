import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeroBackground } from './HeroBackground';

type IntersectionCallback = (entries: Partial<IntersectionObserverEntry>[]) => void;

let intersect: IntersectionCallback | undefined;
let resize: (() => void) | undefined;
let reducedMotion = false;
const motionListeners = new Set<() => void>();

function fakeContext() {
  return {
    globalAlpha: 1,
    fillStyle: '',
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
  };
}

beforeEach(() => {
  intersect = undefined;
  resize = undefined;
  reducedMotion = false;
  motionListeners.clear();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionCallback) {
        intersect = callback;
      }
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      get matches() {
        return reducedMotion;
      },
      addEventListener: (_: string, listener: () => void) => motionListeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => motionListeners.delete(listener),
    })),
  );
});

afterEach(() => {
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
});

function setup(ctx: ReturnType<typeof fakeContext> | null = fakeContext()) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
  const request = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
  const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  return { ctx, request, cancel };
}

describe('HeroBackground', () => {
  it('is decorative and animates while visible', () => {
    const { request } = setup();
    const { container } = render(<HeroBackground />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('canvas')).not.toBeNull();
    expect(container.querySelector('video')).toBeNull();
    expect(request).toHaveBeenCalled();
  });

  it('pauses off screen and when the tab is hidden', () => {
    const { cancel, request } = setup();
    render(<HeroBackground />);
    act(() => {
      intersect?.([{ isIntersecting: false }]);
    });
    expect(cancel).toHaveBeenCalled();

    request.mockClear();
    act(() => {
      intersect?.([{ isIntersecting: true }]);
    });
    expect(request).toHaveBeenCalledOnce();

    cancel.mockClear();
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(cancel).toHaveBeenCalled();
  });

  it('draws one still frame under reduced motion and never starts the loop', () => {
    reducedMotion = true;
    const { ctx, request } = setup();
    render(<HeroBackground />);
    expect(request).not.toHaveBeenCalled();
    expect(ctx?.clearRect).toHaveBeenCalled();
    act(() => {
      resize?.();
    });
    expect(request).not.toHaveBeenCalled();
  });

  it('switches to a still frame when reduced motion is turned on', () => {
    const { cancel } = setup();
    render(<HeroBackground />);
    reducedMotion = true;
    act(() => {
      for (const listener of motionListeners) listener();
    });
    expect(cancel).toHaveBeenCalled();
  });

  it('plays an optional self-hosted video, muted and inline, and pauses it off screen', () => {
    setup();
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const { container } = render(
      <HeroBackground video={{ webm: '/hero.webm', mp4: '/hero.mp4', poster: '/hero.jpg' }} />,
    );
    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(video?.muted).toBe(true);
    expect(video).toHaveAttribute('playsinline');
    expect(video).toHaveAttribute('loop');
    expect(video).toHaveAttribute('poster', '/hero.jpg');
    expect([...(video?.querySelectorAll('source') ?? [])].map((s) => s.type)).toEqual([
      'video/webm',
      'video/mp4',
    ]);
    expect(play).toHaveBeenCalled();
    act(() => {
      intersect?.([{ isIntersecting: false }]);
    });
    expect(pause).toHaveBeenCalled();
  });

  it('shows only the poster image under reduced motion', () => {
    reducedMotion = true;
    setup();
    const { container } = render(<HeroBackground video={{ mp4: '/hero.mp4', poster: '/p.jpg' }} />);
    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('img')).toHaveAttribute('src', '/p.jpg');
  });

  it('does nothing without a 2D context', () => {
    const { request } = setup(null);
    render(<HeroBackground />);
    expect(request).not.toHaveBeenCalled();
  });
});
