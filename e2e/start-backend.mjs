// Starts a throwaway Artha backend for the end-to-end suite: a fresh database in a temp
// folder each run (HOME too, so ~/.financeos/settings.json from a real install is never
// read), on its own port so it never touches a dev session.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'artha-e2e-'));
const venv = process.platform === 'win32' ? join(root, 'venv', 'Scripts', 'python.exe') : join(root, 'venv', 'bin', 'python');
const python = existsSync(venv) ? venv : process.platform === 'win32' ? 'python' : 'python3';

const child = spawn(python, ['-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', process.env.E2E_BACKEND_PORT], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, HOME: dir, USERPROFILE: dir, FINANCE_DB_DIR: dir, ARTHA_FRONTEND_PORT: process.env.E2E_FRONTEND_PORT },
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', (code) => process.exit(code ?? 0));
