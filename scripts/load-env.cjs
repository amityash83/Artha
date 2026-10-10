// Loads the optional repo-root .env (see .env.example) into process.env, without
// overriding variables that are already set. One place to configure local ports for
// every dev entry point: scripts/backend.mjs, frontend/vite.config.mts, electron/main.js
// (dev only) and start.sh (which sources the same file). Deliberately tiny: KEY=VALUE
// lines, # comments, optional quotes; no dependency on dotenv.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function loadRootEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return {};
  const loaded = {};
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
      loaded[key] = value;
    }
  }
  return loaded;
}

module.exports = { loadRootEnv, ROOT };
