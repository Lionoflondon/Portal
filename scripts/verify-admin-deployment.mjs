import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const project = 'portal-prod-f2308';
const adminSite = 'portal-admin-f2308';
const adminCustomUrl = 'https://admin.useportalnow.com';
const adminDefaultUrl = 'https://portal-admin-f2308.web.app';
const publicPortalUrl = 'https://portal-prod-f2308.web.app';

async function curlGet(url) {
  const { stdout } = await execFileAsync('curl', ['-fsSL', url], { maxBuffer: 2 * 1024 * 1024 });
  return stdout;
}

async function verifyHttp200(label, url) {
  const { stdout } = await execFileAsync('curl', ['-fsSL', '-o', '/dev/null', '-w', '%{http_code}', url]);
  const status = stdout.trim();
  if (status !== '200') {
    throw new Error(`${url} returned HTTP ${status}`);
  }
  console.log(`✓ ${label} returns HTTP 200`);
}

function absoluteAssetUrl(assetPath) {
  return new URL(assetPath, adminCustomUrl).toString();
}

function extractAsset(html, pattern, label) {
  const match = html.match(pattern);
  if (!match?.[1]) {
    throw new Error(`Could not find ${label} asset in Admin HTML`);
  }
  return match[1];
}

async function verifyAdminHtml() {
  const html = await curlGet(adminCustomUrl);

  if (!html.includes('<title>Portal Admin</title>')) {
    throw new Error('Admin page title is not "Portal Admin"');
  }
  console.log('✓ Admin page title is "Portal Admin"');

  const jsAsset = extractAsset(html, /<script[^>]+src="([^"]+\.js)"/, 'main JS');
  const cssAsset = extractAsset(html, /<link[^>]+href="([^"]+\.css)"/, 'main CSS');

  await verifyHttp200('Admin main JS asset', absoluteAssetUrl(jsAsset));
  await verifyHttp200('Admin main CSS asset', absoluteAssetUrl(cssAsset));
}

async function verifyReleaseNonEmpty() {
  const { stdout } = await execFileAsync('firebase', [
    'hosting:channel:list',
    '--site',
    adminSite,
    '--project',
    project,
    '--json',
  ]);
  const payload = JSON.parse(stdout);
  const live = payload.result?.channels?.find((channel) => channel.name?.endsWith('/channels/live'));
  const version = live?.release?.version;

  if (!live?.release?.name || !version?.name || version.status !== 'FINALIZED') {
    throw new Error(`Admin live release is missing or not finalized. release=${live?.release?.name || 'missing'}, version=${version?.name || 'missing'}, status=${version?.status || 'missing'}`);
  }
  console.log(`✓ Admin live release is finalized (${version.name})`);
}

async function verifyNoRiderSenderTargets() {
  const [firebaseJson, firebaseRc] = await Promise.all([
    readFile('firebase.json', 'utf8'),
    readFile('.firebaserc', 'utf8'),
  ]);
  const combined = `${firebaseJson}\n${firebaseRc}`.toLowerCase();
  const forbidden = ['rider', 'sender'];
  const found = forbidden.filter((word) => combined.includes(word));

  if (found.length) {
    throw new Error(`Rider/Sender hosting target reference found in Portal config: ${found.join(', ')}`);
  }
  console.log('✓ Rider and Sender Hosting targets are not present in this Portal deployment config');
}

async function main() {
  await verifyHttp200('Admin custom domain', adminCustomUrl);
  await verifyHttp200('Admin default domain', adminDefaultUrl);
  await verifyAdminHtml();
  await verifyReleaseNonEmpty();
  await verifyHttp200('Public Portal', publicPortalUrl);
  await verifyNoRiderSenderTargets();
  console.log('Admin deployment verification passed.');
}

main().catch((error) => {
  console.error(`Admin deployment verification failed: ${error.message}`);
  process.exitCode = 1;
});
