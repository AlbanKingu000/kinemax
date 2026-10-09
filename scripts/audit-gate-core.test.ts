import { describe, expect, it } from 'vitest';
import {
  advisoryId,
  evaluateAudit,
  formatResult,
  PRISMA_CLI_ALLOWLIST,
  type AuditReport,
  type Severity,
} from './audit-gate-core.ts';

function advisory(name: string, id: string, severity: Severity = 'high') {
  return { name, title: `${name} problem`, url: `https://github.com/advisories/${id}`, severity };
}

/** The report npm currently produces for the Prisma CLI chain (trimmed). */
const prismaCliReport: AuditReport = {
  vulnerabilities: {
    'deepmerge-ts': {
      name: 'deepmerge-ts',
      nodes: ['node_modules/@prisma/config/node_modules/deepmerge-ts'],
      via: [advisory('deepmerge-ts', 'GHSA-ggr8-5vv4-36mx')],
    },
    mysql2: {
      name: 'mysql2',
      nodes: ['node_modules/prisma/node_modules/mysql2'],
      via: [
        advisory('mysql2', 'GHSA-3f6p-5ww8-9rcr'),
        // Rated moderate: below the gate threshold, so it needs no exception.
        advisory('mysql2', 'GHSA-rgwj-5xj2-c3m3', 'moderate'),
      ],
    },
    '@prisma/config': {
      name: '@prisma/config',
      nodes: ['node_modules/@prisma/config'],
      via: ['deepmerge-ts'],
    },
    prisma: { name: 'prisma', nodes: ['node_modules/prisma'], via: ['@prisma/config', 'mysql2'] },
  },
};

describe('evaluateAudit', () => {
  it('passes the known Prisma CLI advisories as documented exceptions', () => {
    const result = evaluateAudit(prismaCliReport);
    expect(result.blocking).toEqual([]);
    expect(result.allowed.map((f) => f.id).sort()).toEqual([
      'GHSA-3f6p-5ww8-9rcr',
      'GHSA-ggr8-5vv4-36mx',
    ]);
    expect(result.stale).toEqual([]);
  });

  it('passes a clean report and marks every exception as stale', () => {
    const result = evaluateAudit({ vulnerabilities: {} });
    expect(result.blocking).toEqual([]);
    expect(result.stale).toHaveLength(PRISMA_CLI_ALLOWLIST.length);
  });

  it('blocks any new high or critical advisory', () => {
    const report: AuditReport = {
      vulnerabilities: {
        express: {
          name: 'express',
          nodes: ['node_modules/express'],
          via: [advisory('express', 'GHSA-new1-new1-new1', 'critical')],
        },
      },
    };
    expect(evaluateAudit(report).blocking).toEqual([
      expect.objectContaining({ id: 'GHSA-new1-new1-new1', package: 'express' }),
    ]);
  });

  it('blocks an allowlisted advisory when the package is installed outside the Prisma CLI', () => {
    const report: AuditReport = {
      vulnerabilities: {
        mysql2: {
          name: 'mysql2',
          nodes: ['node_modules/prisma/node_modules/mysql2', 'node_modules/mysql2'],
          via: [advisory('mysql2', 'GHSA-3f6p-5ww8-9rcr')],
        },
      },
    };
    expect(evaluateAudit(report).blocking).toHaveLength(1);
  });

  it('blocks an allowlisted id reported for a different package or without install paths', () => {
    const report: AuditReport = {
      vulnerabilities: {
        other: {
          name: 'other',
          nodes: ['node_modules/prisma/node_modules/other'],
          via: [advisory('other', 'GHSA-3f6p-5ww8-9rcr')],
        },
        mysql2: { name: 'mysql2', via: [advisory('mysql2', 'GHSA-3f6p-5ww8-9rcr')] },
      },
    };
    expect(evaluateAudit(report).blocking).toHaveLength(2);
  });

  it('ignores low and moderate advisories', () => {
    const report: AuditReport = {
      vulnerabilities: {
        pkg: {
          name: 'pkg',
          nodes: ['node_modules/pkg'],
          via: [advisory('pkg', 'GHSA-low', 'low'), advisory('pkg', 'GHSA-mod', 'moderate')],
        },
      },
    };
    expect(evaluateAudit(report).blocking).toEqual([]);
  });

  it('throws when npm audit could not produce a report', () => {
    expect(() => evaluateAudit({ error: { code: 'ENOTFOUND' } })).toThrow(/usable report/);
    expect(() => evaluateAudit({})).toThrow(/usable report/);
  });
});

describe('advisoryId', () => {
  it('extracts the GHSA id or falls back to the url', () => {
    expect(advisoryId('https://github.com/advisories/GHSA-abcd-efgh-ijkl')).toBe(
      'GHSA-abcd-efgh-ijkl',
    );
    expect(advisoryId('https://example.com/advisory/1')).toBe('https://example.com/advisory/1');
  });
});

describe('formatResult', () => {
  it('reports allowed exceptions and a pass', () => {
    const text = formatResult(evaluateAudit(prismaCliReport));
    expect(text).toContain('Allowed (documented exceptions, Prisma CLI only)');
    expect(text).toContain('Audit gate passed');
    expect(text).not.toContain('Blocking');
  });

  it('reports blocking findings, stale exceptions and a failure', () => {
    const text = formatResult({
      blocking: [
        {
          id: 'GHSA-x',
          package: 'express',
          severity: 'high',
          title: 'bad',
          nodes: ['node_modules/express'],
        },
      ],
      allowed: [],
      stale: PRISMA_CLI_ALLOWLIST.slice(0, 1),
    });
    expect(text).toContain('HIGH express GHSA-x: bad [node_modules/express]');
    expect(text).toContain('Stale exceptions');
    expect(text).toContain('Audit gate FAILED: 1');
  });
});
