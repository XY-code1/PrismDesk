import { spawnSync } from 'node:child_process';

const env = {
  ...process.env,
  ELECTRON_MIRROR: process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/',
  ELECTRON_BUILDER_BINARIES_MIRROR: process.env.ELECTRON_BUILDER_BINARIES_MIRROR || 'https://npmmirror.com/mirrors/electron-builder-binaries/',
};

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('npm_execpath is unavailable; run this through npm run package:win');

for (const [command, args] of [
  [process.execPath, [npmCli, 'run', 'check']],
  [process.execPath, [npmCli, 'test']],
  [process.execPath, [npmCli, 'run', 'build']],
  [process.execPath, ['node_modules/electron-builder/cli.js', '--win', 'nsis', 'portable']],
]) {
  const result = spawnSync(command, args, { env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
