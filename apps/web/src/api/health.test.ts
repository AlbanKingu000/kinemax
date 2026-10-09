import { describe, expect, it } from 'vitest';
import { stubFetchFailure, stubFetchJson } from '../test/fetch';
import { fetchHealth } from './health';

describe('fetchHealth', () => {
  it('calls the same-origin /api/health endpoint and parses the body', async () => {
    const fetchMock = stubFetchJson({ status: 'ok', db: 'up' });
    await expect(fetchHealth()).resolves.toEqual({ status: 'ok', db: 'up' });
    expect(fetchMock).toHaveBeenCalledWith('/api/health', {
      headers: { Accept: 'application/json' },
    });
  });

  it('parses the 503 body when the database is down', async () => {
    stubFetchJson({ status: 'error', db: 'down' }, 503);
    await expect(fetchHealth()).resolves.toEqual({ status: 'error', db: 'down' });
  });

  it('passes the abort signal through', async () => {
    const fetchMock = stubFetchJson({ status: 'ok', db: 'up' });
    const controller = new AbortController();
    await fetchHealth(controller.signal);
    expect(fetchMock).toHaveBeenCalledWith('/api/health', {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  });

  it('rejects an unexpected body', async () => {
    stubFetchJson({ status: 'great' });
    await expect(fetchHealth()).rejects.toThrow();
  });

  it('rejects when the API cannot be reached', async () => {
    stubFetchFailure();
    await expect(fetchHealth()).rejects.toThrow('Failed to fetch');
  });
});
