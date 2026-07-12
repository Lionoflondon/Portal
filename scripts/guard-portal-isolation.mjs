import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const failures = [];

function filesUnder(dir, exts = ['.js', '.jsx', '.css', '.html']) {
  const base = join(root, dir);
  const out = [];
  function walk(path) {
    for (const name of readdirSync(path)) {
      const full = join(path, name);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        if (!['node_modules', 'dist', 'dist-admin', '.git'].includes(name)) walk(full);
      } else if (exts.some((ext) => full.endsWith(ext)) && !full.includes('.test.')) {
        out.push(full);
      }
    }
  }
  walk(base);
  return out;
}

function checkFile(file, rules) {
  const text = readFileSync(file, 'utf8');
  const rel = relative(root, file);
  for (const [pattern, message] of rules) {
    if (pattern.test(text)) failures.push(`${rel}: ${message}`);
  }
}

for (const file of filesUnder('src/ui')) {
  checkFile(file, [
    [/from ['"].*admin/i, 'Public UI must not import Admin modules.'],
    [/<Admin|function Admin|AdminWorkspace|AdminHandleRegistry/, 'Public UI must not define or render Admin components.'],
    [/#\/admin|['"]\/admin['"]|startsWith\(['"]\/admin/, 'Public UI must not define Admin routes.'],
    [/getPortalAdminHandle|managePortalHandleRegistry|reclaimPortalHandle|refundPlaceholderPortalHandlePurchase/, 'Public UI must not call Admin-only backend operations.'],
    [/portalAdmin|getPortalTokenClaims|isAdminUser/, 'Public UI must not perform Admin claim checks.'],
  ]);
}

for (const file of filesUnder('src/admin')) {
  if (file.endsWith('admin.css')) continue;
  checkFile(file, [
    [/from ['"].*\/ui\//, 'Admin must not import Public UI modules.'],
    [/interaction-bar|PostCard|QuoteEchoComposer|Echo with comment|Bookmark|Share this post/, 'Admin must not contain public timeline interaction UI.'],
  ]);
}

checkFile(join(root, 'src/styles.css'), [
  [/\.admin-|admin-shell|admin-nav|admin-content|vortex-story-card|pulse-meter/, 'Shared public stylesheet must not contain Admin-only selectors.'],
]);

checkFile(join(root, 'src/main.jsx'), [
  [/@portal\/admin|AdminApp|admin\.css/, 'Public entry must not import Admin app or Admin CSS.'],
]);

checkFile(join(root, 'admin/src/main.jsx'), [
  [/\.\/ui\/|@portal\/ui/, 'Admin entry must not import Public UI.'],
]);

if (failures.length) {
  console.error('Portal isolation guard failed:\n');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Portal isolation guard passed.');
