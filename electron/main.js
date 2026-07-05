const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow = null;
let pyProc = null;

function startBackend() {
  const isDev = !app.isPackaged;
  let pythonBin = 'python';

  if (isDev) {
    // Windows venv Python binary path
    pythonBin = path.join(__dirname, '..', 'venv', 'Scripts', 'python.exe');
  } else {
    // If packaged, run the compiled backend binary (or local executable)
    pythonBin = path.join(process.resourcesPath, 'backend', 'dist', 'main', 'main.exe');
  }

  // Resolve Database directory for portability
  let dbDir = '';
  if (isDev) {
    dbDir = path.join(__dirname, '..', 'data');
  } else {
    if (process.env.PORTABLE_EXECUTABLE_DIR) {
      // Save database next to the portable .exe (e.g., on a USB drive)
      dbDir = path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'data');
    } else {
      // Fallback to appdata
      dbDir = path.join(app.getPath('userData'), 'data');
    }
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
  const env = { ...process.env, FINANCE_DB_DIR: dbDir };

  // Start FastAPI using Uvicorn (dev) or direct standalone executable (packaged)
  let args = [];
  if (isDev) {
    args = ['-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', '8000'];
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    title: "Artha",
    autoHideMenuBar: true,
    backgroundColor: '#07090e',
    show: false // Show only after content is loaded to avoid white flash
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    // Open DevTools in dev mode
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    triggerAutoBackup('open');
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
    port: 8000,
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
    // Kill the python subprocess tree on Windows
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
