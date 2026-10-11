// The only bridge between the web UI and the desktop shell. The page runs with Node
// integration off and context isolation + sandbox on, so it cannot require() anything;
// it gets exactly the functions exposed here, as window.artha. The frontend reaches
// them through frontend/src/platform.ts and falls back gracefully on the web.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('artha', {
  isDesktop: true,
  /** Native open/save dialog for a SQLite file. Resolves to the chosen path, or null if cancelled. */
  selectDbFile: (mode) => ipcRenderer.invoke('select-db-file', mode === 'create' ? 'create' : 'open'),
  /** Native folder picker. Resolves to the chosen folder, or null if cancelled. */
  selectFolder: (title) => ipcRenderer.invoke('select-folder', typeof title === 'string' ? title : null),
  /** Save the current page (print layout) as a PDF via a save dialog. Resolves to the saved path, or null if cancelled. */
  savePdf: (suggestedName) => ipcRenderer.invoke('save-pdf', typeof suggestedName === 'string' ? suggestedName : null),
  /** Menu bar commands (see buildMenu in main.js). Returns an unsubscribe function. */
  onMenuCommand: (callback) => {
    const listener = (_event, command) => { if (typeof command === 'string') callback(command); };
    ipcRenderer.on('menu-command', listener);
    return () => ipcRenderer.removeListener('menu-command', listener);
  },
});
