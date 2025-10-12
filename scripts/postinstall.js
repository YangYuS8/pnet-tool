#!/usr/bin/env node
const { dependencies = {}, devDependencies = {} } = require('../package.json');

const skip = process.env.PNET_SKIP_POSTINSTALL === '1';
if (skip) {
  process.exit(0);
}

const target = `${process.platform}/${process.arch}`;
console.log(`[postinstall] rebuilding native modules for ${target}`);

const electronVersion = (devDependencies.electron || dependencies.electron || '').match(/\d+\.\d+\.\d+/);
const resolvedElectronVersion = electronVersion ? electronVersion[0] : undefined;

async function rebuildWithElectronRebuild() {
  let rebuild;
  try {
    ({ rebuild } = require('@electron/rebuild'));
  } catch (error) {
    console.warn('[postinstall] @electron/rebuild is not available, skipping native rebuild');
    return;
  }

  try {
    await rebuild({
      buildPath: process.cwd(),
      electronVersion: resolvedElectronVersion,
      onlyModules: ['node-pty'],
      arch: process.arch,
    });
    console.log('[postinstall] electron-rebuild complete');
  } catch (error) {
    console.error('[postinstall] electron-rebuild failed:', error);
    process.exit(1);
  }
}

rebuildWithElectronRebuild().catch((error) => {
  console.error('[postinstall] unexpected failure:', error);
  process.exit(1);
});
