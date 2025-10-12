#!/usr/bin/env node
const { spawnSync } = require('child_process');

const skip = process.env.PNET_SKIP_POSTINSTALL === '1';
if (skip) {
  process.exit(0);
}

const target = `${process.platform}/${process.arch}`;
console.log(`[postinstall] preparing native modules for ${target}`);

function run(command, args) {
  return spawnSync('pnpm', ['exec', command, ...args], { stdio: 'inherit' });
}

const installAppDeps = run('electron-builder', ['install-app-deps', '--platform', process.platform, '--arch', process.arch]);

if (installAppDeps.status === 0) {
  process.exit(0);
}

console.warn('[postinstall] electron-builder install-app-deps failed, falling back to electron-rebuild');

const rebuild = run('electron-rebuild', []);

if (rebuild.status !== 0) {
  const code = rebuild.status ?? 1;
  process.exit(code);
}
