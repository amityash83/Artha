#!/usr/bin/env node
// Artha dev control: one implementation for every OS, reached through thin wrappers
// (./artha on macOS/Linux, .\artha.ps1 / artha.cmd on Windows, `npm run artha --`).
//
//   start [desktop|web] [--reload]   start services (default: desktop = backend + web UI + Electron)
//   stop                             stop everything this script started
//   restart [desktop|web]            stop, then start (default: the mode last started)
//   status [--json]                  services, health, URLs, paths, builds, tooling
//   logs [backend|frontend|desktop] [-f] [-n N]
//   build [web|backend|all]          production builds (web -> frontend/dist, backend -> backend/dist/main)
//   package [mac|win|linux]          desktop installer for an OS (default: this OS)
//
// Ports: ARTHA_BACKEND_PORT / ARTHA_FRONTEND_PORT from the shell or the repo-root .env,
// default 8010 / 5183 (scripts/load-env.cjs). State lives in .run/ (pid + log per service).
//
// Safety: stop only ever signals processes recorded in .run/*.pid, or processes whose
// command line contains this repo's path. It never kills "whatever is on a port".
import { spawn, spawnSync } from 'node:child_process';
import {
  closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { loadRootEnv, ROOT, devPorts, devAllowedOrigins } = require('./load-env.cjs');
const envFileLoaded = Object.keys(loadRootEnv());

const IS_WIN = process.platform === 'win32';
const RUN_DIR = path.join(ROOT, '.run');
const PORTS = devPorts();
const BACKEND_URL = `http://127.0.0.1:${PORTS.backend}`;
const FRONTEND_URL = `http://localhost:${PORTS.frontend}`;
const PYTHON = IS_WIN ? path.join(ROOT, 'venv', 'Scripts', 'python.exe') : path.join(ROOT, 'venv', 'bin', 'python');
const SERVICES = ['backend', 'frontend', 'desktop'];
// Older start.sh used different file names; read them too so stop/status still work.
const LEGACY_NAMES = { frontend: 'vite', desktop: 'electron' };
const READY_TIMEOUT_MS = 40000;

const color = (code) => (s) => (process.stdout.isTTY && !process.env.NO_COLOR ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const green = color(32);
const red = color(31);
const yellow = color(33);
const dim = color(2);
const bold = color(1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// State: pid files
// ---------------------------------------------------------------------------

const pidFile = (svc) => path.join(RUN_DIR, `${svc}.pid`);
const logFile = (svc) => path.join(RUN_DIR, `${svc}.log`);

function readPid(svc) {
  for (const name of [svc, LEGACY_NAMES[svc]].filter(Boolean)) {
    const file = path.join(RUN_DIR, `${name}.pid`);
    if (existsSync(file)) {
      const pid = Number(readFileSync(file, 'utf8').trim());
      if (Number.isInteger(pid) && pid > 0) return { pid, file };
    }
  }
  return null;
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

// ---------------------------------------------------------------------------
// Health checks: identity by response content, not just "something answered"
// ---------------------------------------------------------------------------

async function probe(url, test) {
  const started = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    const body = await res.text();
    return { ok: res.ok && test(body), status: res.status, ms: Date.now() - started };
  } catch {
    return { ok: false, status: null, ms: null };
  }
}

const probeBackend = () => probe(`${BACKEND_URL}/api/init`, (b) => b.includes('"summary"'));
const probeFrontend = () => probe(`${FRONTEND_URL}/`, (b) => /<title>Artha/i.test(b));

function portInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => resolve(err.code === 'EADDRINUSE'));
    server.once('listening', () => server.close(() => resolve(false)));
    server.listen(Number(port), '127.0.0.1');
  });
}

function portOwner(port) {
  if (IS_WIN) {
    const out = spawnSync('netstat', ['-ano'], { encoding: 'utf8' }).stdout || '';
    const line = out.split(/\r?\n/).find((l) => l.includes(`:${port} `) && /LISTENING/i.test(l));
    return line ? `pid ${line.trim().split(/\s+/).pop()}` : 'unknown process';
  }
  const out = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).stdout || '';
  const row = out.split('\n')[1];
  return row ? `${row.split(/\s+/)[0]} (pid ${row.split(/\s+/)[1]})` : 'unknown process';
}

// ---------------------------------------------------------------------------
// Processes belonging to this repo but not tracked (e.g. started via npm start)
// ---------------------------------------------------------------------------

// [{ pid, exe (executable file name), cmd (full command line) }]
function listProcesses() {
  if (IS_WIN) {
    const ps = spawnSync('powershell', ['-NoProfile', '-Command',
      'Get-CimInstance Win32_Process | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress'], { encoding: 'utf8' });
    try {
      return [].concat(JSON.parse(ps.stdout || '[]')).map((p) => ({ pid: p.ProcessId, exe: p.Name || '', cmd: p.CommandLine || '' }));
    } catch {
      return [];
    }
  }
  const rows = (fields) => (spawnSync('ps', ['-axo', `pid=,${fields}=`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).stdout || '')
    .split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const i = l.indexOf(' ');
      return [Number(l.slice(0, i)), l.slice(i + 1).trim()];
    });
  const exeByPid = new Map(rows('comm').map(([pid, comm]) => [pid, path.basename(comm)]));
  return rows('command').map(([pid, cmd]) => ({ pid, exe: exeByPid.get(pid) || '', cmd }));
}

function processCwd(pid) {
  if (IS_WIN) return null;
  const out = spawnSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], { encoding: 'utf8' }).stdout || '';
  const line = out.split('\n').find((l) => l.startsWith('n'));
  return line ? line.slice(1) : null;
}

// Artha's own dev processes that aren't in .run/ (e.g. started by `npm start` or an old
// start.sh). Only real python/node/electron programs count, never shells or editors
// whose command line merely mentions this folder.
const STRAY_KINDS = [
  { exe: /^python(\d(\.\d+)?)?(\.exe)?$/i, args: /-m\s+uvicorn\s+backend\.main:app/, checkCwd: true },
  { exe: /^node(\.exe)?$/i, args: /vite(\.js)?(\s|$)|scripts[\\/]backend\.mjs/ },
  { exe: /^electron(\.exe)?$/i, args: /./ },
];

function strayProcesses() {
  const tracked = new Set(SERVICES.map(readPid).filter(Boolean).map((t) => t.pid));
  return listProcesses().filter((p) => {
    if (p.pid === process.pid || tracked.has(p.pid) || !p.cmd) return false;
    const kind = STRAY_KINDS.find((k) => k.exe.test(p.exe) && k.args.test(p.cmd));
    if (!kind) return false;
    if (p.cmd.includes(ROOT)) return true;
    return Boolean(kind.checkCwd && processCwd(p.pid) === ROOT);
  });
}

// ---------------------------------------------------------------------------
// Starting
// ---------------------------------------------------------------------------

function electronBinary() {
  try {
    return require(path.join(ROOT, 'node_modules', 'electron')); // the package exports the binary path
  } catch {
    return null;
  }
}

function serviceSpec(svc, opts) {
  const env = {
    ...process.env,
    ARTHA_BACKEND_PORT: PORTS.backend,
    ARTHA_FRONTEND_PORT: PORTS.frontend,
    ARTHA_ALLOWED_ORIGINS: devAllowedOrigins(PORTS.frontend),
  };
  if (svc === 'backend') {
    const args = ['-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', PORTS.backend];
    if (opts.reload) args.push('--reload', '--reload-dir', 'backend');
    return { cmd: PYTHON, args, cwd: ROOT, env: { ...env, FINANCE_DB_DIR: process.env.FINANCE_DB_DIR || path.join(ROOT, 'data') } };
  }
  if (svc === 'frontend') {
    return { cmd: process.execPath, args: [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')], cwd: path.join(ROOT, 'frontend'), env };
  }
  const desktopEnv = { ...env, ARTHA_EXTERNAL_BACKEND: '1' };
  delete desktopEnv.ELECTRON_RUN_AS_NODE; // set by some editors; makes Electron run as plain Node
  return { cmd: electronBinary(), args: [path.join(ROOT, 'electron')], cwd: ROOT, env: desktopEnv };
}

function launch(svc, opts) {
  const spec = serviceSpec(svc, opts);
  mkdirSync(RUN_DIR, { recursive: true });
  const log = openSync(logFile(svc), 'w');
  const child = spawn(spec.cmd, spec.args, {
    cwd: spec.cwd, env: spec.env, detached: true, windowsHide: true, stdio: ['ignore', log, log],
  });
  closeSync(log);
  child.unref();
  writeFileSync(pidFile(svc), String(child.pid));
  for (const legacy of [LEGACY_NAMES[svc]].filter(Boolean)) rmSync(path.join(RUN_DIR, `${legacy}.pid`), { force: true });
  return child.pid;
}

async function waitFor(probeFn, svc) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const tracked = readPid(svc);
    if (tracked && !isAlive(tracked.pid)) return false;
    if ((await probeFn()).ok) return true;
    await sleep(500);
  }
  return false;
}

function checkPrerequisites(mode) {
  const problems = [];
  if (!existsSync(PYTHON)) {
    problems.push(`Python venv missing (${path.relative(ROOT, PYTHON)}). Run: python -m venv venv && `
      + `${IS_WIN ? 'venv\\Scripts\\pip' : 'venv/bin/pip'} install -r backend/requirements.txt`);
  }
  if (!existsSync(path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'))) problems.push('Node packages missing. Run: npm install');
  if (mode === 'desktop') {
    const bin = electronBinary();
    if (!bin || !existsSync(bin)) problems.push('Electron binary missing. Run: npm install (or node node_modules/electron/install.js)');
  }
  return problems;
}

async function startService(svc, probeFn, port, opts) {
  const tracked = readPid(svc);
  if (tracked && isAlive(tracked.pid) && (!probeFn || (await probeFn()).ok)) {
    console.log(`  ${svc.padEnd(8)} ${dim(`already running (pid ${tracked.pid})`)}`);
    return true;
  }
  if (probeFn && (await probeFn()).ok) {
    console.log(`  ${svc.padEnd(8)} ${yellow(`already served on :${port} by a process this script didn't start (${portOwner(port)})`)}`);
    console.log(`           ${dim('Run "artha stop" (it also stops this repo\'s untracked processes) or stop it yourself.')}`);
    return false;
  }
  if (port && (await portInUse(port))) {
    console.log(`  ${svc.padEnd(8)} ${red(`port ${port} is used by another app: ${portOwner(port)}`)}`);
    console.log(`           ${dim(`Free it, or set ARTHA_${svc === 'backend' ? 'BACKEND' : 'FRONTEND'}_PORT in .env`)}`);
    return false;
  }
  const pid = launch(svc, opts);
  if (!probeFn) {
    await sleep(1500);
    const ok = isAlive(pid);
    console.log(`  ${svc.padEnd(8)} ${ok ? green(`started (pid ${pid})`) : red(`exited - see ${path.relative(ROOT, logFile(svc))}`)}`);
    return ok;
  }
  process.stdout.write(`  ${svc.padEnd(8)} starting (pid ${pid})... `);
  const ok = await waitFor(probeFn, svc);
  console.log(ok ? green('ready') : red(`not ready - see ${path.relative(ROOT, logFile(svc))}`));
  return ok;
}

async function start(args) {
  const mode = args.find((a) => a === 'web' || a === 'desktop') || 'desktop';
  const opts = { reload: args.includes('--reload') };
  const problems = checkPrerequisites(mode);
  if (problems.length) {
    problems.forEach((p) => console.log(red(`  x ${p}`)));
    process.exitCode = 1;
    return;
  }
  console.log(bold(`Starting Artha (${mode}) - backend :${PORTS.backend}, frontend :${PORTS.frontend}`));
  mkdirSync(RUN_DIR, { recursive: true });
  writeFileSync(path.join(RUN_DIR, 'mode'), mode);
  const ok = await startService('backend', probeBackend, PORTS.backend, opts)
    && await startService('frontend', probeFrontend, PORTS.frontend, opts)
    && (mode === 'web' || await startService('desktop', null, null, opts));
  console.log('');
  if (!ok) {
    console.log(red('Artha did not start cleanly. Check the messages above and "artha logs".'));
    process.exitCode = 1;
    return;
  }
  console.log(green('Artha is running.'));
  console.log(`  App       ${FRONTEND_URL}${mode === 'desktop' ? dim('  (also open in the desktop window)') : ''}`);
  console.log(`  API docs  ${BACKEND_URL}/docs`);
  console.log(dim('  "artha status" for details, "artha stop" to stop.'));
}

// ---------------------------------------------------------------------------
// Stopping
// ---------------------------------------------------------------------------

async function killTree(pid) {
  if (IS_WIN) {
    spawnSync('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' });
    return;
  }
  const signal = (sig) => {
    try {
      process.kill(-pid, sig); // detached => own process group (npm/vite/electron helpers too)
    } catch {
      try { process.kill(pid, sig); } catch { /* already gone */ }
    }
  };
  signal('SIGTERM');
  for (let i = 0; i < 20 && isAlive(pid); i++) await sleep(250);
  if (isAlive(pid)) signal('SIGKILL');
}

async function stop() {
  console.log(bold('Stopping Artha'));
  let stopped = 0;
  for (const svc of [...SERVICES].reverse()) {
    const tracked = readPid(svc);
    if (!tracked) {
      console.log(`  ${svc.padEnd(8)} ${dim('not running')}`);
      continue;
    }
    if (isAlive(tracked.pid)) {
      await killTree(tracked.pid);
      console.log(`  ${svc.padEnd(8)} ${green(`stopped (pid ${tracked.pid})`)}`);
      stopped++;
    } else {
      console.log(`  ${svc.padEnd(8)} ${dim('not running (cleared stale pid file)')}`);
    }
    rmSync(tracked.file, { force: true });
  }
  for (const p of strayProcesses()) {
    await killTree(p.pid);
    console.log(`  ${'other'.padEnd(8)} ${green(`stopped untracked ${p.pid}`)} ${dim(p.cmd.slice(0, 80))}`);
    stopped++;
  }
  if (!stopped) console.log(dim('  Nothing was running.'));
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

function fmtTime(file) {
  if (!existsSync(file)) return null;
  const d = statSync(file).mtime;
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? d.toTimeString().slice(0, 5) : d.toISOString().slice(0, 16).replace('T', ' ');
}

function latestArtifact(dir) {
  const full = path.join(ROOT, dir);
  if (!existsSync(full)) return null;
  const files = readdirSync(full).filter((f) => /\.(dmg|zip|exe|AppImage)$/.test(f))
    .map((f) => ({ f, t: statSync(path.join(full, f)).mtime }));
  files.sort((a, b) => b.t - a.t);
  return files[0] ? { path: `${dir}/${files[0].f}`, built: fmtTime(path.join(full, files[0].f)) } : null;
}

function expectedDatabase() {
  const settingsFile = path.join(os.homedir(), '.financeos', 'settings.json');
  try {
    const active = JSON.parse(readFileSync(settingsFile, 'utf8')).active_db_path;
    if (active) return { path: active, source: '~/.financeos/settings.json' };
  } catch { /* no settings yet */ }
  const dir = process.env.FINANCE_DB_DIR || path.join(ROOT, 'data');
  return { path: path.join(dir, 'finance.db'), source: process.env.FINANCE_DB_DIR ? 'FINANCE_DB_DIR' : 'default (data/)' };
}

function toolVersions() {
  const run = (cmd, args) => {
    const r = spawnSync(cmd, args, { encoding: 'utf8' });
    return r.status === 0 ? (r.stdout || r.stderr).trim() : null;
  };
  let electron = null;
  try {
    electron = require(path.join(ROOT, 'node_modules', 'electron', 'package.json')).version;
  } catch { /* not installed */ }
  const bin = electronBinary();
  return {
    node: process.versions.node,
    python: existsSync(PYTHON) ? (run(PYTHON, ['--version']) || '?').replace('Python ', '') : null,
    electron: electron ? `${electron}${bin && existsSync(bin) ? '' : ' (binary missing)'}` : null,
  };
}

function dockerSummary() {
  const r = spawnSync('docker', ['compose', '-p', 'artha', 'ps', '--format', 'json'], { cwd: ROOT, encoding: 'utf8', timeout: 4000 });
  if (r.error || r.status !== 0) return null;
  return (r.stdout || '').split('\n').filter(Boolean).map((l) => {
    try {
      const c = JSON.parse(l);
      return { service: c.Service, state: c.State, status: c.Status, ports: c.Publishers?.filter((p) => p.PublishedPort)
        .map((p) => `${p.PublishedPort}->${p.TargetPort}`).join(', ') || '' };
    } catch {
      return null;
    }
  }).filter(Boolean);
}

async function collectStatus() {
  const [backendProbe, frontendProbe] = await Promise.all([probeBackend(), probeFrontend()]);
  const probes = { backend: backendProbe, frontend: frontendProbe, desktop: null };
  const services = SERVICES.map((svc) => {
    const tracked = readPid(svc);
    const alive = tracked ? isAlive(tracked.pid) : false;
    const p = probes[svc];
    let state = 'stopped';
    if (alive && (!p || p.ok)) state = 'running';
    else if (alive) state = 'unhealthy';
    else if (tracked) state = 'stale pid';
    else if (p?.ok) state = 'untracked';
    return {
      service: svc,
      state,
      pid: alive ? tracked.pid : null,
      port: svc === 'desktop' ? null : Number(PORTS[svc]),
      url: svc === 'backend' ? BACKEND_URL : svc === 'frontend' ? FRONTEND_URL : null,
      check: p ? (p.ok ? `ok (${p.ms} ms)` : 'no response') : null,
      log: path.relative(ROOT, logFile(svc)),
    };
  });

  let database = expectedDatabase();
  if (backendProbe.ok) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/settings/database`, { signal: AbortSignal.timeout(2500) });
      const body = await res.json();
      database = { path: body.active_path, source: 'reported by the running backend' };
    } catch { /* keep the expectation */ }
  }
  let mode = null;
  try { mode = readFileSync(path.join(RUN_DIR, 'mode'), 'utf8').trim(); } catch { /* never started */ }

  return {
    repo: ROOT,
    mode,
    config: {
      env_file: existsSync(path.join(ROOT, '.env')) ? '.env' : null,
      from_env_file: envFileLoaded,
      backend_port: Number(PORTS.backend),
      frontend_port: Number(PORTS.frontend),
    },
    services,
    untracked_processes: strayProcesses().map((p) => ({ pid: p.pid, command: p.cmd.slice(0, 160) })),
    urls: {
      app: FRONTEND_URL,
      api: `${BACKEND_URL}/api`,
      api_docs: `${BACKEND_URL}/docs`,
      openapi: `${BACKEND_URL}/openapi.json`,
    },
    paths: {
      database: database.path,
      database_source: database.source,
      database_exists: database.path ? existsSync(database.path) : false,
      logs: path.relative(ROOT, RUN_DIR),
      env_example: '.env.example',
    },
    builds: {
      web: fmtTime(path.join(ROOT, 'frontend', 'dist', 'index.html')),
      backend_binary: fmtTime(path.join(ROOT, 'backend', 'dist', 'main', IS_WIN ? 'main.exe' : 'main')),
      desktop_package: ['dist-portable-mac', 'dist-portable', 'dist-portable-linux'].map(latestArtifact).find(Boolean) || null,
    },
    tooling: toolVersions(),
    docker: dockerSummary(),
  };
}

const STATE_COLOR = { running: green, stopped: dim, unhealthy: red, 'stale pid': yellow, untracked: yellow };

async function status(args) {
  const s = await collectStatus();
  if (args.includes('--json')) {
    console.log(JSON.stringify(s, null, 2));
    return;
  }
  const ports = `ports ${s.config.backend_port}/${s.config.frontend_port} from `
    + (s.config.from_env_file.some((k) => k.endsWith('_PORT')) ? '.env' : 'defaults/shell');
  console.log(bold('Artha dev services') + dim(`   ${s.repo}   ${ports}${s.mode ? `   last mode: ${s.mode}` : ''}`));
  console.log('');
  const rows = [['SERVICE', 'STATE', 'PID', 'PORT', 'URL', 'CHECK']];
  for (const svc of s.services) {
    rows.push([svc.service, svc.state, svc.pid ?? '-', svc.port ?? '-', svc.url ?? (svc.service === 'desktop' ? 'Electron window' : '-'), svc.check ?? '-']);
  }
  const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => String(r[i]).length)));
  rows.forEach((r, i) => {
    const line = r.map((c, j) => String(c).padEnd(widths[j])).join('  ');
    if (i === 0) console.log(dim(line));
    else console.log(line.replace(r[1], (STATE_COLOR[r[1]] || ((x) => x))(r[1])));
  });
  if (s.untracked_processes.length) {
    console.log('');
    console.log(yellow(`Untracked Artha processes (not started by this script; "artha stop" stops them):`));
    s.untracked_processes.forEach((p) => console.log(dim(`  ${p.pid}  ${p.command.slice(0, 110)}`)));
  }
  const kv = (k, v) => console.log(`  ${k.padEnd(14)} ${v}`);
  console.log('');
  console.log(bold('URLs'));
  kv('App', s.urls.app);
  kv('API', s.urls.api);
  kv('API docs', s.urls.api_docs);
  console.log('');
  console.log(bold('Paths'));
  kv('Database', `${s.paths.database} ${dim(`(${s.paths.database_source}${s.paths.database_exists ? '' : ', file not created yet'})`)}`);
  kv('Logs', s.services.map((x) => x.log).join('  '));
  kv('Config', s.config.env_file ? '.env' : dim('no .env (copy .env.example to customise ports)'));
  console.log('');
  console.log(bold('Builds'));
  kv('Web', s.builds.web ? `frontend/dist ${dim(`(${s.builds.web})`)}` : dim('not built (artha build web)'));
  kv('Backend', s.builds.backend_binary ? `backend/dist/main ${dim(`(${s.builds.backend_binary})`)}` : dim('not built (artha build backend)'));
  kv('Desktop', s.builds.desktop_package ? `${s.builds.desktop_package.path} ${dim(`(${s.builds.desktop_package.built})`)}` : dim('not packaged (artha package)'));
  console.log('');
  console.log(bold('Tooling'));
  kv('Versions', `node ${s.tooling.node}  python ${s.tooling.python ?? red('venv missing')}  electron ${s.tooling.electron ?? red('missing')}`);
  if (s.docker && s.docker.length) {
    console.log('');
    console.log(bold('Docker (web deployment, project "artha")'));
    s.docker.forEach((c) => kv(c.service, `${c.state}  ${c.ports}`));
  }
}

// ---------------------------------------------------------------------------
// Logs, build, package
// ---------------------------------------------------------------------------

async function logs(args) {
  const svc = args.find((a) => SERVICES.includes(a)) || 'backend';
  const n = Number(args[args.indexOf('-n') + 1]) || 40;
  const file = [logFile(svc), ...[LEGACY_NAMES[svc]].filter(Boolean).map((l) => path.join(RUN_DIR, `${l}.log`))].find(existsSync);
  if (!file) {
    console.log(dim(`No log for ${svc} yet (${path.relative(ROOT, logFile(svc))}).`));
    return;
  }
  const text = readFileSync(file, 'utf8');
  console.log(dim(`--- ${path.relative(ROOT, file)} (last ${n} lines) ---`));
  process.stdout.write(text.split('\n').slice(-n - 1).join('\n'));
  if (!args.includes('-f')) return;
  let size = statSync(file).size;
  for (;;) {
    await sleep(500);
    const now = statSync(file).size;
    if (now > size) {
      const fd = openSync(file, 'r');
      const buf = Buffer.alloc(now - size);
      require('node:fs').readSync(fd, buf, 0, buf.length, size);
      closeSync(fd);
      process.stdout.write(buf.toString('utf8'));
    }
    size = now;
  }
}

function npm(script) {
  console.log(bold(`> npm run ${script}`));
  const r = spawnSync(IS_WIN ? 'npm.cmd' : 'npm', ['run', script], { cwd: ROOT, stdio: 'inherit', shell: IS_WIN });
  if (r.status !== 0) {
    process.exitCode = r.status || 1;
    return false;
  }
  return true;
}

function build(args) {
  const what = args[0] || 'all';
  const backendScript = IS_WIN ? 'build:backend' : 'build:backend:posix';
  if (what === 'web') return npm('build:frontend');
  if (what === 'backend') return npm(backendScript);
  if (what === 'all') return npm('build:frontend') && npm(backendScript);
  console.log(red(`Unknown build target "${what}". Use: web | backend | all`));
  process.exitCode = 1;
  return false;
}

function packageApp(args) {
  const here = IS_WIN ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux';
  const target = args[0] || here;
  const script = { win: 'package:portable', mac: 'package:mac', linux: 'package:linux' }[target];
  if (!script) {
    console.log(red(`Unknown package target "${target}". Use: mac | win | linux`));
    process.exitCode = 1;
    return;
  }
  if (target !== here) {
    console.log(yellow(`Note: PyInstaller can't cross-compile, so a ${target} package must be built on ${target} (or in CI).`));
  }
  npm(script);
}

// ---------------------------------------------------------------------------

const HELP = `${bold('artha')} - control the Artha dev environment (same on macOS, Linux and Windows)

  ${bold('start')} [desktop|web] [--reload]   start services (default desktop: backend + web UI + Electron)
  ${bold('stop')}                             stop everything this tool started (and this repo's strays)
  ${bold('restart')} [desktop|web]            stop + start (default: the last mode started)
  ${bold('status')} [--json]                  services, health, URLs, database, logs, builds, tooling
  ${bold('logs')} [backend|frontend|desktop] [-f] [-n N]
  ${bold('build')} [web|backend|all]          production builds
  ${bold('package')} [mac|win|linux]          desktop installer (default: this OS)

Ports: ${PORTS.backend} (backend) / ${PORTS.frontend} (frontend). Override with ARTHA_BACKEND_PORT /
ARTHA_FRONTEND_PORT in the shell or in .env (see .env.example). State: .run/`;

const [command = 'help', ...rest] = process.argv.slice(2);
switch (command) {
  case 'start': await start(rest); break;
  case 'stop': await stop(); break;
  case 'restart': {
    let last = 'desktop';
    try { last = readFileSync(path.join(RUN_DIR, 'mode'), 'utf8').trim() || 'desktop'; } catch { /* never started */ }
    await stop();
    console.log('');
    await start(rest.length ? rest : [last]);
    break;
  }
  case 'status': await status(rest); break;
  case 'logs': await logs(rest); break;
  case 'build': build(rest); break;
  case 'package': packageApp(rest); break;
  case 'help': case '--help': case '-h': console.log(HELP); break;
  default:
    console.log(red(`Unknown command "${command}".\n`));
    console.log(HELP);
    process.exitCode = 1;
}
