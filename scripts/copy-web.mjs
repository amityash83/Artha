// Copies the built web UI (frontend/dist) into electron/web so electron-builder can
// package it with the desktop shell. Run `npm run build:frontend` first.
import { cpSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'frontend', 'dist');
const target = path.join(root, 'electron', 'web');

if (!existsSync(path.join(source, 'index.html'))) {
  console.error(`No web build found at ${source}. Run "npm run build:frontend" first.`);
  process.exit(1);
}
rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
console.log(`Copied ${path.relative(root, source)} -> ${path.relative(root, target)}`);
