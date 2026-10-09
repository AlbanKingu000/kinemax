import { afterEach, describe, expect, it, vi } from 'vitest';
import { consoleLogger, describeError } from '../src/logger.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('consoleLogger', () => {
  it('writes info and error messages with optional metadata', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    consoleLogger.info('started');
    consoleLogger.error('failed', { code: 1 });
    expect(info).toHaveBeenCalledWith('started');
    expect(error).toHaveBeenCalledWith('failed', { code: 1 });
  });
});

describe('describeError', () => {
  it('describes Error instances and other thrown values', () => {
    expect(describeError(new TypeError('bad'))).toMatchObject({
      name: 'TypeError',
      message: 'bad',
    });
    expect(describeError(42)).toEqual({ value: '42' });
  });
});
