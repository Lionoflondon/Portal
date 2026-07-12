import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const checks = [
  {
    name: 'Admin callable exists',
    file: 'functions/index.js',
    patterns: ['export const executePortalAdminAction', 'requireAdminPermission(request, permission)', 'adminIdempotency', 'adminApprovals', 'correlationId'],
  },
  {
    name: 'Audit logs are immutable to clients',
    file: 'firestore.rules',
    patterns: ['match /auditLogs/{auditId} { allow read, write: if false; }'],
  },
  {
    name: 'Admin isolation guard exists',
    file: 'scripts/guard-portal-isolation.mjs',
    patterns: ['Public UI must not import Admin modules', 'Admin must not import Public UI modules'],
  },
  {
    name: 'Admin production readiness report exists',
    file: 'docs/admin-production-readiness.md',
    patterns: ['Production Readiness Report', 'Deployment Recommendation'],
  },
];

const failures = [];
for (const check of checks) {
  const path = resolve(root, check.file);
  if (!existsSync(path)) {
    failures.push(`${check.name}: missing ${check.file}`);
    continue;
  }
  const source = readFileSync(path, 'utf8');
  for (const pattern of check.patterns) {
    if (!source.includes(pattern)) failures.push(`${check.name}: missing "${pattern}" in ${check.file}`);
  }
}

if (failures.length) {
  console.error('Admin production readiness check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Admin production readiness check passed.');
