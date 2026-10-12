import { afterEach, describe, expect, it, vi } from 'vitest';
import { canRender3D } from './use-seat-map';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('canRender3D', () => {
  it('is false without WebGL', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(canRender3D()).toBe(false);
  });

  it('is true with WebGL on a normal device', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as RenderingContext);
    vi.stubGlobal('navigator', { hardwareConcurrency: 8, deviceMemory: 8 });
    expect(canRender3D()).toBe(true);
  });

  it('is false on a very weak device (2 cores and 2 GB or less)', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as RenderingContext);
    vi.stubGlobal('navigator', { hardwareConcurrency: 2, deviceMemory: 2 });
    expect(canRender3D()).toBe(false);
  });

  it('is false when creating a context throws', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(canRender3D()).toBe(false);
  });
});
