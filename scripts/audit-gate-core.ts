// Pure logic of the production audit gate (see audit-gate.ts and the README "Dependency audit").

export type Severity = 'info' | 'low' | 'moderate' | 'high' | 'critical';

/** An advisory we knowingly accept, limited to one package at specific install paths. */
export interface AllowedAdvisory {
  id: string;
  package: string;
  /** Every install path of the package must start with one of these prefixes. */
  pathPrefixes: readonly string[];
  reason: string;
}

/** Subset of the `npm audit --json` (auditReportVersion 2) format that the gate reads. */
export interface AuditReport {
  error?: unknown;
  vulnerabilities?: Record<
    string,
    {
      name: string;
      nodes?: string[];
      via: (string | { name: string; title: string; url: string; severity: Severity })[];
    }
  >;
}

export interface Finding {
  id: string;
  package: string;
  severity: Severity;
  title: string;
  nodes: string[];
}

export interface GateResult {
  blocking: Finding[];
  allowed: Finding[];
  /** Allowlist entries that no longer match anything and should be removed. */
  stale: AllowedAdvisory[];
}

const BLOCKING_SEVERITIES = new Set<Severity>(['high', 'critical']);

/** Prisma CLI internals: the CLI is an (optional) peer of @prisma/client, so npm counts it as prod. */
const PRISMA_CLI_PATHS = ['node_modules/prisma/', 'node_modules/@prisma/config/'];

export const PRISMA_CLI_ALLOWLIST: readonly AllowedAdvisory[] = [
  {
    id: 'GHSA-ggr8-5vv4-36mx',
    package: 'deepmerge-ts',
    pathPrefixes: PRISMA_CLI_PATHS,
    reason: 'Only used by the Prisma CLI to merge its own config files; never loaded by the app.',
  },
  {
    id: 'GHSA-3f6p-5ww8-9rcr',
    package: 'mysql2',
    pathPrefixes: PRISMA_CLI_PATHS,
    reason: 'MySQL driver bundled with the Prisma CLI; Kinemax uses PostgreSQL only.',
  },
];

export function advisoryId(url: string): string {
  return /GHSA-[\w-]+/.exec(url)?.[0] ?? url;
}

export function evaluateAudit(
  report: AuditReport,
  allowlist: readonly AllowedAdvisory[] = PRISMA_CLI_ALLOWLIST,
): GateResult {
  if (report.error !== undefined || report.vulnerabilities === undefined) {
    throw new Error('npm audit did not return a usable report (network or registry problem?).');
  }

  const blocking: Finding[] = [];
  const allowed: Finding[] = [];
  const used = new Set<AllowedAdvisory>();

  for (const vulnerability of Object.values(report.vulnerabilities)) {
    const nodes = vulnerability.nodes ?? [];
    for (const via of vulnerability.via) {
      // String entries only say "depends on a vulnerable package"; that package has its own entry.
      if (typeof via === 'string' || !BLOCKING_SEVERITIES.has(via.severity)) continue;
      const finding: Finding = {
        id: advisoryId(via.url),
        package: via.name,
        severity: via.severity,
        title: via.title,
        nodes,
      };
      const match = allowlist.find(
        (entry) =>
          entry.id === finding.id &&
          entry.package === finding.package &&
          nodes.length > 0 &&
          nodes.every((node) => entry.pathPrefixes.some((prefix) => node.startsWith(prefix))),
      );
      if (match) {
        used.add(match);
        allowed.push(finding);
      } else {
        blocking.push(finding);
      }
    }
  }

  return { blocking, allowed, stale: allowlist.filter((entry) => !used.has(entry)) };
}

export function formatResult({ blocking, allowed, stale }: GateResult): string {
  const line = (f: Finding) =>
    `  - ${f.severity.toUpperCase()} ${f.package} ${f.id}: ${f.title} [${f.nodes.join(', ')}]`;
  const parts: string[] = [];
  if (blocking.length > 0) {
    parts.push(`Blocking advisories in production dependencies:\n${blocking.map(line).join('\n')}`);
  }
  if (allowed.length > 0) {
    parts.push(
      `Allowed (documented exceptions, Prisma CLI only):\n${allowed.map(line).join('\n')}`,
    );
  }
  if (stale.length > 0) {
    parts.push(
      `Stale exceptions (no longer reported; remove them from scripts/audit-gate-core.ts):\n${stale
        .map((entry) => `  - ${entry.package} ${entry.id}`)
        .join('\n')}`,
    );
  }
  parts.push(
    blocking.length > 0
      ? `Audit gate FAILED: ${String(blocking.length)} high/critical advisory(ies).`
      : 'Audit gate passed: no unexpected high/critical advisories in production dependencies.',
  );
  return parts.join('\n\n');
}
