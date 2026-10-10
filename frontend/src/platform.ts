// What the UI can do depends on where it runs: the desktop app (Electron) exposes a
// small API via electron/preload.js as window.artha; a plain browser (dev server or
// the Docker/web deployment) has none. Components ask here instead of touching
// Electron directly, so one frontend codebase works in both.

interface ArthaDesktopApi {
  isDesktop: true;
  selectDbFile: (mode: 'open' | 'create') => Promise<string | null>;
  savePdf: (suggestedName: string) => Promise<string | null>;
}

declare global {
  interface Window {
    artha?: ArthaDesktopApi;
  }
}

export const isDesktop = (): boolean => window.artha?.isDesktop === true;

/**
 * Save the page's print layout as a PDF. Desktop: native save dialog, resolves to the saved
 * path (null if cancelled). Browser: opens the print dialog (choose "Save as PDF") and
 * resolves to 'print-dialog'.
 */
export async function saveAsPdf(suggestedName: string): Promise<string | null> {
  if (window.artha) return window.artha.savePdf(suggestedName);
  window.print();
  return 'print-dialog';
}

/** Native file dialog for picking/creating a database file. Desktop only; null if cancelled or unavailable. */
export async function selectDatabaseFile(mode: 'open' | 'create'): Promise<string | null> {
  if (!window.artha) return null;
  return window.artha.selectDbFile(mode);
}
