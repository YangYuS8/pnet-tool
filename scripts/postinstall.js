#!/usr/bin/env node
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
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

function spawnPnpm(args) {
  const pnpmExecPath = process.env.npm_execpath;
  if (pnpmExecPath && pnpmExecPath.includes('pnpm')) {
    return spawnSync(process.execPath, [pnpmExecPath, ...args], { stdio: 'inherit' });
  }

  const direct = spawnSync('pnpm', args, { stdio: 'inherit' });
  if (!direct.error || direct.error.code !== 'ENOENT') {
    return direct;
  }

  return spawnSync('corepack', ['pnpm', ...args], { stdio: 'inherit' });
}

function spawnPackageWithNpx(pkgName, binName, args) {
  const pinned = versions[pkgName];
  const target = pinned ? `${pkgName}@${pinned}` : pkgName;
  const npxArgs = pkgName === binName ? ['--yes', target, ...args] : ['--yes', target, binName, ...args];

  const bundledNpx = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
  if (fs.existsSync(bundledNpx)) {
    const bundled = spawnSync(process.execPath, [bundledNpx, ...npxArgs], { stdio: 'inherit' });
    if (!bundled.error || bundled.error.code !== 'ENOENT') {
      return bundled;
    }
  }

  return spawnSync('npx', npxArgs, { stdio: 'inherit' });
}

function runWithFallback(pkgName, binName, args, { allowDlx } = { allowDlx: true }) {
  const execResult = spawnPnpm(['exec', binName, ...args]);
  if (execResult.error && execResult.error.code === 'ENOENT') {
    return spawnPackageWithNpx(pkgName, binName, args);
  }
  if (execResult.status === 0 || !allowDlx) {
    return execResult;
  }

  const pinned = versions[pkgName];
  const dlxTarget = pinned ? `${pkgName}@${pinned}` : pkgName;
  const dlxArgs = pkgName === binName ? [dlxTarget, ...args] : [dlxTarget, binName, ...args];
  const dlxResult = spawnPnpm(['dlx', ...dlxArgs]);
  if (dlxResult.error && dlxResult.error.code === 'ENOENT') {
    return spawnPackageWithNpx(pkgName, binName, args);
  }
  return dlxResult;
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
