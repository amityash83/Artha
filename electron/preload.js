// The only bridge between the web UI and the desktop shell. The page runs with Node
// integration off and context isolation + sandbox on, so it cannot require() anything;
// it gets exactly the functions exposed here, as window.artha. The frontend reaches
// them through frontend/src/platform.ts and falls back gracefully on the web.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('artha', {
  isDesktop: true,
  /** Native open/save dialog for a SQLite file. Resolves to the chosen path, or null if cancelled. */
  selectDbFile: (mode) => ipcRenderer.invoke('select-db-file', mode === 'create' ? 'create' : 'open'),
});
