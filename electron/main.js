const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow = null;
let pyProc = null;

// Ports. Dev: shared defaults/overrides from scripts/load-env.cjs (repo-root .env), the
// same as the CLI, Vite and the backend launcher. Packaged: the bundled backend always
// runs on 8000 (the web build bakes that in), unless overridden by env vars.
let BACKEND_PORT = process.env.ARTHA_BACKEND_PORT || '8000';
let FRONTEND_PORT = process.env.ARTHA_FRONTEND_PORT || '5173';
if (!app.isPackaged) {
  try {
    const env = require('../scripts/load-env.cjs');
    env.loadRootEnv();
    ({ backend: BACKEND_PORT, frontend: FRONTEND_PORT } = env.devPorts());
  } catch (err) {
    console.warn('Could not load dev port settings:', err.message);
  }
}

function startBackend() {
  // The dev CLI (scripts/artha.mjs) runs and supervises the backend itself and says so,
  // so the window doesn't start a second one that would just fail on the busy port.
  if (process.env.ARTHA_EXTERNAL_BACKEND === '1') {
    console.log(`Using the backend already running on port ${BACKEND_PORT}.`);
    return;
  }
  const isDev = !app.isPackaged;
  const isWin = process.platform === 'win32';
  let pythonBin = 'python';

  if (isDev) {
    // venv layout differs by OS: Windows uses Scripts/python.exe, macOS/Linux use bin/python
    pythonBin = isWin
      ? path.join(__dirname, '..', 'venv', 'Scripts', 'python.exe')
      : path.join(__dirname, '..', 'venv', 'bin', 'python');
  } else {
    // If packaged, run the compiled backend binary. PyInstaller's --onedir output names
    // the binary main.exe on Windows and a plain extensionless "main" on macOS/Linux.
    const backendBinName = isWin ? 'main.exe' : 'main';
    pythonBin = path.join(process.resourcesPath, 'backend', 'dist', 'main', backendBinName);
  }

  // Resolve Database directory for portability
  let dbDir = '';
  if (isDev) {
    dbDir = path.join(__dirname, '..', 'data');
  } else if (isWin) {
    // Windows portable target: electron-builder sets PORTABLE_EXECUTABLE_DIR so the DB
    // can live next to the .exe (e.g., on a USB drive). Fall back to userData if absent.
    dbDir = process.env.PORTABLE_EXECUTABLE_DIR
      ? path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'data')
      : path.join(app.getPath('userData'), 'data');
  } else {
    // macOS/Linux have no "portable executable" concept in electron-builder (dmg/zip/
    // AppImage aren't extracted next to a writable sidecar directory the same way) —
    // always use the OS-standard per-user app data directory.
    dbDir = path.join(app.getPath('userData'), 'data');
  }

  const fs = require('fs');
  let logStream = null;
  try {
    fs.mkdirSync(dbDir, { recursive: true });
    logStream = fs.createWriteStream(path.join(dbDir, 'backend_log.txt'), { flags: 'w' });
    logStream.write(`[INIT] Spawn backend. Path: ${pythonBin}\n`);
    logStream.write(`[INIT] Cwd: ${isDev ? path.join(__dirname, '..') : path.dirname(pythonBin)}\n`);
    logStream.write(`[INIT] Database Dir: ${dbDir}\n`);
  } catch (err) {
    console.error("Failed to create log stream:", err);
  }

  console.log(`Starting backend server from: ${pythonBin}`);
  console.log(`Database directory set to: ${dbDir}`);

  // Inherit environment variables and inject FINANCE_DB_DIR
  const env = {
    ...process.env,
    FINANCE_DB_DIR: dbDir,
    ARTHA_BACKEND_PORT: BACKEND_PORT,
    // Dev: the window loads the Vite server, so the backend must allow that origin (CORS).
    ARTHA_FRONTEND_PORT: FRONTEND_PORT,
  };

  // Start FastAPI using Uvicorn (dev) or direct standalone executable (packaged)
  let args = [];
  if (isDev) {
    args = ['-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', BACKEND_PORT];
  }

  pyProc = spawn(pythonBin, args, {
    cwd: isDev ? path.join(__dirname, '..') : path.dirname(pythonBin),
    shell: true,
    env: env
  });

  pyProc.stdout.on('data', (data) => {
    const text = data.toString().trim();
    console.log(`[FastAPI] ${text}`);
    if (logStream) logStream.write(`[STDOUT] ${text}\n`);
  });

  pyProc.stderr.on('data', (data) => {
    const text = data.toString().trim();
    console.error(`[FastAPI-Error] ${text}`);
    if (logStream) logStream.write(`[STDERR] ${text}\n`);
  });

  pyProc.on('error', (err) => {
    console.error(`[FastAPI-SpawnError] ${err.message}`);
    if (logStream) logStream.write(`[SPAWN_ERROR] ${err.message}\n`);
  });

  pyProc.on('close', (code) => {
    console.log(`FastAPI process exited with code ${code}`);
    if (logStream) {
      logStream.write(`[EXIT] Process exited with code ${code}\n`);
      logStream.end();
    }
  });
}

// The menu bar: Artha's own, replacing Electron's default (whose View menu exposed
// DevTools/Force Reload and whose Help linked to electronjs.org). Items that act on the
// app send a command to the page (preload.js onMenuCommand -> App.runCommand), the same
// commands the in-app top bar uses. Hidden until Alt on Windows/Linux (autoHideMenuBar);
// always present on macOS, where it also carries the standard shortcuts.
function buildMenu(isDev) {
  const isMac = process.platform === 'darwin';
  const send = (command) => () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('menu-command', command);
  };
  const settingsItem = { label: isMac ? 'Settings…' : 'Settings', accelerator: 'CmdOrCtrl+,', click: send('settings') };
  const template = [
    ...(isMac ? [{
      // Explicit labels: in development app.name is the package name ("@artha/electron").
      // (Renaming the app instead would also move Electron's userData folder.)
      label: 'Artha',
      submenu: [
        { role: 'about', label: 'About Artha' }, { type: 'separator' }, settingsItem, { type: 'separator' },
        { role: 'services' }, { type: 'separator' }, { role: 'hide', label: 'Hide Artha' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' }, { role: 'quit', label: 'Quit Artha' },
      ],
    }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Transaction', accelerator: 'CmdOrCtrl+N', click: send('new-transaction') },
        {
          label: 'New',
          submenu: [
            { label: 'Account', click: send('new-account') },
            { label: 'Asset or Investment', click: send('new-asset') },
            { label: 'Loan', click: send('new-loan') },
            { label: 'Credit Card', click: send('new-credit-card') },
            { label: 'Income Entry', click: send('new-income') },
            { label: 'Expense Entry', click: send('new-expense') },
          ],
        },
        { type: 'separator' },
        { label: 'Open Database…', accelerator: 'CmdOrCtrl+O', click: send('open-database') },
        { label: 'New Database…', click: send('new-database') },
        { type: 'separator' },
        { label: 'Back Up Now', click: send('backup-now') },
        ...(isMac ? [{ type: 'separator' }, { role: 'close' }] : [{ type: 'separator' }, settingsItem, { type: 'separator' }, { role: 'quit', label: 'Exit' }]),
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Go To…', accelerator: 'CmdOrCtrl+K', click: send('goto') },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(isDev ? [{ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' }] : []),
      ],
    },
    { role: 'windowMenu' },
    { role: 'help', submenu: [{ label: 'Artha Help', click: send('help') }] },
  ];
  return Menu.buildFromTemplate(template);
}

function createWindow() {
  const isDev = !app.isPackaged;
  // Window icon (Linux/Windows taskbar — macOS uses the app bundle icon set via
  // electron-builder's build.mac.icon instead, not this option). Same PNG Vite
  // copies from frontend/public into the web build, which packaging copies to web/.
  const windowIcon = isDev
    ? path.join(__dirname, '..', 'frontend', 'public', 'favicon.png')
    : path.join(__dirname, 'web', 'favicon.png');

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    icon: windowIcon,
    webPreferences: {
      // The UI is a plain web app: no Node access in the page. Desktop-only features
      // go through the small API in preload.js (window.artha), per Electron's
      // security guidelines.
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    },
    title: "Artha",
    autoHideMenuBar: true,
    backgroundColor: '#07090e',
    show: false // Show only after content is loaded to avoid white flash
  });

  if (isDev) {
    mainWindow.loadURL(`http://localhost:${FRONTEND_PORT}`);
    // Open DevTools in dev mode
    // mainWindow.webContents.openDevTools();
  } else {
    // The web UI build, copied next to this file by scripts/copy-web.mjs before packaging.
    mainWindow.loadFile(path.join(__dirname, 'web', 'index.html'));
  }

  Menu.setApplicationMenu(buildMenu(isDev));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // The on-open backup is taken by the backend itself at startup (backend/backups.py).
  });

  let isQuitting = false;
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      triggerAutoBackup('close', () => {
        isQuitting = true;
        app.quit();
      });
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// MMEx-Style Auto-Backup trigger
function triggerAutoBackup(trigger, callback) {
  const { net } = require('electron');
  const req = net.request({
    method: 'POST',
    protocol: 'http:',
    hostname: '127.0.0.1',
    port: BACKEND_PORT,
    path: `/api/backup/auto-run?trigger=${trigger}`
  });
  let called = false;
  const done = () => {
    if (!called) {
      called = true;
      if (callback) callback();
    }
  };
  
  req.on('response', (response) => {
    console.log(`[Backup] Auto backup on ${trigger} completed.`);
    done();
  });
  req.on('error', (err) => {
    console.error(`[Backup] Auto backup on ${trigger} failed:`, err);
    done();
  });
  req.end();
  
  // Timeout fallback
  setTimeout(done, 1500);
}

// IPC Channel to show native Save / Open File dialogs
ipcMain.handle('select-db-file', async (event, mode) => {
  if (!mainWindow) return null;
  if (mode !== 'create' && mode !== 'open') return null;
  
  const options = {
    title: mode === 'create' ? 'Create New Database File' : 'Open Existing Database File',
    filters: [{ name: 'SQLite Database (*.db)', extensions: ['db', 'sqlite'] }]
  };

  let result;
  if (mode === 'create') {
    result = await dialog.showSaveDialog(mainWindow, {
      ...options,
      defaultPath: 'finance.db'
    });
  } else {
    result = await dialog.showOpenDialog(mainWindow, {
      ...options,
      properties: ['openFile']
    });
  }

  if (result.canceled) return null;
  
  if (mode === 'create') {
    return result.filePath;
  } else {
    return result.filePaths[0];
  }
});

// Save the current page as a PDF (the report view uses print CSS, which printToPDF honours).
ipcMain.handle('save-pdf', async (event, suggestedName) => {
  if (!mainWindow) return null;
  // Only ever a bare file name from the page; never a path it chose.
  const name = typeof suggestedName === 'string' && /^[\w .()-]{1,120}\.pdf$/i.test(suggestedName)
    ? suggestedName : 'artha-tax-report.pdf';
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save report as PDF',
    defaultPath: name,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (result.canceled || !result.filePath) return null;
  // The page margins are painted with the window's background colour (dark), so print
  // on white and restore it afterwards.
  mainWindow.setBackgroundColor('#ffffff');
  let pdf;
  try {
    pdf = await event.sender.printToPDF({ printBackground: true, pageSize: 'A4' });
  } finally {
    mainWindow.setBackgroundColor('#07090e');
  }
  require('fs').writeFileSync(result.filePath, pdf);
  return result.filePath;
});

app.on('ready', () => {
  startBackend();
  // Wait 1.5 seconds for FastAPI server to boot up before opening React window
  setTimeout(createWindow, 1500);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (pyProc) {
    console.log('Terminating FastAPI server...');
    // taskkill is Windows-only; on macOS/Linux the exec() call below fails immediately
    // (no such binary), which is expected — the err-callback SIGKILL fallback is the
    // actual macOS/Linux shutdown path. Already cross-platform-correct, no branch needed.
    const { exec } = require('child_process');
    exec(`taskkill /pid ${pyProc.pid} /t /f`, (err) => {
      if (err) {
        pyProc.kill('SIGKILL');
      }
    });
  }
});

process.on('exit', () => {
  if (pyProc) {
    pyProc.kill('SIGKILL');
  }
});
