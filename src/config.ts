export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

// Docker/web mode only: baked in at frontend build time via Vite `define` (see
// vite.config.mts / docker-compose.yml). Empty string in desktop/dev builds —
// auth is fully inert unless both this and the backend's ARTHA_API_SECRET are set.
//
// SECURITY NOTE: this value is compiled into the frontend's JS bundle and is
// visible to anyone who opens browser devtools or views page source on the
// deployed site. It is NOT a secret from any user who can already load the
// page — it only keeps casual scanners/opportunistic bots that stumble on an
// exposed port without a browser session from getting API access "for free."
// It is not a defense against a targeted attacker or a user who already has
// legitimate access to open the app in a browser and inspect it.
export const API_SECRET = import.meta.env.VITE_API_SECRET || '';
