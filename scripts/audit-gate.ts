// Production audit gate used by `npm run audit` / `npm run verify`.
// Runs `npm audit --omit=dev` and fails on any high/critical advisory that is not a documented
// exception in audit-gate-core.ts. Run with Node's built-in TypeScript support: node scripts/audit-gate.ts
import { spawnSync } from 'node:child_process';
import { evaluateAudit, formatResult, type AuditReport } from './audit-gate-core.ts';

const audit = spawnSync('npm audit --omit=dev --json', {
  shell: true,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});

let report: AuditReport;
try {
  report = JSON.parse(audit.stdout) as AuditReport;
} catch {
  console.error(`npm audit did not return JSON:\n${audit.stderr}`);
  process.exit(1);
}

try {
  const result = evaluateAudit(report);
  console.log(formatResult(result));
  process.exit(result.blocking.length > 0 ? 1 : 0);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
