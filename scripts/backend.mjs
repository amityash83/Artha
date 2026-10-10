// Starts the FastAPI backend from the repo's venv on any OS (Windows venv\Scripts vs
// macOS/Linux venv/bin), so the root npm scripts aren't Windows-only.
//   node scripts/backend.mjs [--reload]
// Port: ARTHA_BACKEND_PORT (env or repo-root .env), default 8000.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { loadRootEnv, ROOT } = require('./load-env.cjs');
loadRootEnv();

const isWin = process.platform === 'win32';
const python = isWin ? path.join(ROOT, 'venv', 'Scripts', 'python.exe') : path.join(ROOT, 'venv', 'bin', 'python');
if (!existsSync(python)) {
  console.error(`Python venv not found at ${python}. Create it first:\n  python -m venv venv && ${isWin ? 'venv\\Scripts\\pip' : 'venv/bin/pip'} install -r backend/requirements.txt`);
  process.exit(1);
}

const port = process.env.ARTHA_BACKEND_PORT || '8000';
const args = ['-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', port];
if (process.argv.includes('--reload')) args.push('--reload', '--reload-dir', 'backend');

// cwd must be the repo root: the backend imports itself as the `backend` package.
const child = spawn(python, args, { cwd: ROOT, stdio: 'inherit' });
const forward = (signal) => child.kill(signal);
process.on('SIGINT', forward);
process.on('SIGTERM', forward);
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
