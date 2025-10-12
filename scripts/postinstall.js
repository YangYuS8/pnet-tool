#!/usr/bin/env node
const { spawnSync } = require('child_process');
const { dependencies = {}, devDependencies = {} } = require('../package.json');

const skip = process.env.PNET_SKIP_POSTINSTALL === '1';
if (skip) {
  process.exit(0);
}

const target = `${process.platform}/${process.arch}`;
console.log(`[postinstall] preparing native modules for ${target}`);

const versions = {
  electron: devDependencies.electron || dependencies.electron,
  'electron-builder': devDependencies['electron-builder'] || dependencies['electron-builder'],
  '@electron/rebuild': devDependencies['@electron/rebuild'] || dependencies['@electron/rebuild'],
};

function runWithFallback(pkgName, binName, args, { allowDlx } = { allowDlx: true }) {
  const execResult = spawnSync('pnpm', ['exec', binName, ...args], { stdio: 'inherit' });
  if (execResult.status === 0 || !allowDlx) {
    return execResult;
  }

  const pinned = versions[pkgName];
  const dlxTarget = pinned ? `${pkgName}@${pinned}` : pkgName;
  const dlxArgs = pkgName === binName ? [dlxTarget, ...args] : [dlxTarget, binName, ...args];
  return spawnSync('pnpm', ['dlx', ...dlxArgs], { stdio: 'inherit' });
}

const installAppDeps = runWithFallback('electron-builder', 'electron-builder', ['install-app-deps', '--platform', process.platform, '--arch', process.arch], { allowDlx: false });

if (installAppDeps.status === 0) {
  process.exit(0);
}

console.warn('[postinstall] electron-builder install-app-deps failed, falling back to electron-rebuild');

const extractedElectronVersion = versions.electron && versions.electron.match(/\d+\.\d+\.\d+/);
const rebuildArgs = ['--only', 'node-pty', '--arch', process.arch];
if (extractedElectronVersion && extractedElectronVersion[0]) {
  rebuildArgs.push('--version', extractedElectronVersion[0]);
}

const rebuild = runWithFallback('@electron/rebuild', 'electron-rebuild', rebuildArgs);

if (rebuild.status !== 0) {
  if (rebuild.error) {
    console.error('[postinstall] electron-rebuild error:', rebuild.error);
  }
  const code = rebuild.status ?? 1;
  process.exit(code);
}
