import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { API_BASE_URL, API_SECRET } from './config';

// Docker/web deployments only: if a build-time secret is baked in (see
// config.ts's API_SECRET comment for the full threat model), attach it to
// every request this app makes to its own backend. Desktop/dev builds have
// API_SECRET === '' and this block is a complete no-op — zero behavior change.
// A shared header wrapper across the ~20+ files that call fetch() directly
// would touch far more surface for one header; this is the deliberate,
// lower-footprint tradeoff. It does NOT cover plain <a href> navigations
// (e.g. the document download link), which are fetched-as-blob instead.
if (API_SECRET) {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    if (url.startsWith(API_BASE_URL)) {
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      headers.set('X-Artha-Api-Secret', API_SECRET);
      return nativeFetch(input, { ...init, headers });
    }
    return nativeFetch(input, init);
  };
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
